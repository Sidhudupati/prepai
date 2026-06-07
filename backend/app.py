from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv
import os
import json
import subprocess
import tempfile

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))


app = Flask(__name__)
CORS(app)

model = genai.GenerativeModel("gemini-2.5-flash-lite")


@app.route("/generate-questions", methods=["POST"])
def generate_questions():
    domain = request.json.get("domain")

    prompt = f"""Generate 3 interview questions for a {domain} role.
    Return ONLY the questions, one per line, no numbering, no extra text."""

    response = model.generate_content(prompt)
    questions = [q.strip() for q in response.text.strip().split("\n") if q.strip()]

    return jsonify({"questions": questions[:3]})


@app.route("/analyze", methods=["POST"])
def analyze():
    file = request.files["file"]
    question = request.form.get("question")
    domain = request.form.get("domain")

    # Save uploaded webm to a temp file
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as vf:
        file.save(vf.name)
        video_path = vf.name

    # Extract audio as mp3 using ffmpeg
    audio_path = video_path.replace(".webm", ".mp3")
    subprocess.run(
        ["ffmpeg", "-i", video_path, "-vn", "-acodec", "libmp3lame", audio_path, "-y"],
        check=True,
        capture_output=True,
    )
    size = os.path.getsize(audio_path)

    # Build the prompt
    prompt = f"""You are an interview coach for a {domain} role.
The candidate was asked: "{question}"

CRITICAL RULES:
- Transcribe ONLY the words actually spoken in the audio. Do not invent, complete, or improve the answer.
- If the audio contains no speech, only filler, or only a word like "hello", transcribe exactly that and nothing more.
- Base the score and feedback strictly on what was actually said. A near-empty answer must receive a very low score.

Respond ONLY with valid JSON in this exact format:
{{
  "transcription": "exactly what the candidate said, verbatim",
  "score": <number 0-100>,
  "improvements": ["point 1", "point 2", "point 3"]
}}
No markdown, no code fences, no text outside the JSON."""

    # Read audio bytes and send inline (no upload_file needed)
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    response = model.generate_content([
        prompt,
        {"mime_type": "audio/mp3", "data": audio_bytes},
    ])

    # Clean and parse the JSON response (with fallback)
    text = response.text.strip().replace("```json", "").replace("```", "").strip()
    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        result = {
            "transcription": text,
            "score": 0,
            "improvements": ["Could not parse analysis. Please try again."],
        }

    # Clean up temp files
    os.remove(video_path)
    os.remove(audio_path)

    return jsonify(result)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)