import { useState, useRef } from "react";
import axios from "axios";
import "./App.css";

const DOMAINS = [
  { name: "AI", icon: "🤖" },
  { name: "Cybersecurity", icon: "🔒" },
  { name: "MERN Stack", icon: "⚛️" },
];

function scoreClass(s) {
  if (s >= 70) return "score-high";
  if (s >= 40) return "score-mid";
  return "score-low";
}

function App() {
  const [domain, setDomain] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [done, setDone] = useState(false);

  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const API = "https://prepai-backend.onrender.com";

  const selectDomain = async (d) => {
    setDomain(d);
    setLoading(true);
    try {
      const res = await axios.post(`${API}/generate-questions`, {
      domain: d,
      });
      setQuestions(res.data.questions);
    } catch (err) {
      alert("Error generating questions");
    }
    setLoading(false);
  };

  const advance = () => {
    if (current + 1 < questions.length) {
      setCurrent(current + 1);
    } else {
      setDone(true);
    }
  };

  const startRecording = async () => {
    // Hard reset any leftover stream/recorder from a previous question
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    streamRef.current = stream;
    videoRef.current.srcObject = stream;

    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      uploadRecording(chunksRef.current);
    };
    mediaRecorderRef.current = mr;
    mr.start(1000);
    setRecording(true);
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.requestData(); // flush final chunk
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setRecording(false);
  };

  const uploadRecording = async (chunks) => {
    setAnalyzing(true);
    const blob = new Blob(chunks, { type: "video/webm" });
    chunksRef.current = []; // clear immediately so nothing carries over

    // Guard against an empty/near-empty recording
    if (blob.size < 1000) {
      setResults((prev) => [
        ...prev,
        {
          question: questions[current],
          transcription: "(no audio detected)",
          score: 0,
          improvements: ["No answer was recorded for this question."],
        },
      ]);
      advance();
      setAnalyzing(false);
      return;
    }

    const formData = new FormData();
    formData.append("file", blob, "answer.webm");
    formData.append("question", questions[current]);
    formData.append("domain", domain);

    try {
      const res = await axios.post(`${API}/analyze`, formData);
      setResults((prev) => [
        ...prev,
        { question: questions[current], ...res.data },
      ]);
      advance();
    } catch (err) {
      alert("Error analyzing recording");
    }
    setAnalyzing(false);
  };

  const averageScore = () =>
    Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);

  // ---------- RESULTS SCREEN ----------
  if (done) {
    return (
      <div className="container">
        <h1>
          PrepAI — <span className="accent">Results</span>
        </h1>
        <p className="subtitle">Here's how you did across all questions.</p>

        <div className="overall">
          <div className="overall-label">Overall Score</div>
          <div className="overall-score">
            {averageScore()}
            <span>/100</span>
          </div>
        </div>

        {results.map((r, i) => (
          <div key={i} className="result-card">
            <div className="result-head">
              <div className="result-q">
                Q{i + 1}: {r.question}
              </div>
              <div className={`score-badge ${scoreClass(r.score)}`}>
                {r.score}/100
              </div>
            </div>

            <div className="section-label">Your Answer</div>
            <p className="transcription">{r.transcription}</p>

            <div className="section-label">Where to Improve</div>
            <ul className="improvements">
              {r.improvements.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          </div>
        ))}

        <button
          className="btn btn-ghost"
          onClick={() => window.location.reload()}
        >
          Start Over
        </button>
      </div>
    );
  }

  // ---------- MAIN SCREEN ----------
  return (
    <div className="container">
      <h1>
        Prep<span className="accent">AI</span>
      </h1>
      <p className="subtitle">Your AI-powered interview coach.</p>

      {!domain && (
        <div className="card">
          <h2>Select a domain to begin</h2>
          <div className="domains">
            {DOMAINS.map((d) => (
              <button
                key={d.name}
                className="domain-btn"
                onClick={() => selectDomain(d.name)}
              >
                <span className="domain-icon">{d.icon}</span>
                <span className="domain-name">{d.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="card">
          <div className="status">
            <span className="spinner"></span> Generating your questions...
          </div>
        </div>
      )}

      {questions.length > 0 && !done && (
        <div className="card">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(current / questions.length) * 100}%` }}
            ></div>
          </div>
          <span className="progress-label">
            Question {current + 1} of {questions.length}
          </span>
          <p className="question-text">{questions[current]}</p>

          <div className="video-wrap">
            <video ref={videoRef} autoPlay muted playsInline className="video" />
            {!recording && (
              <div className="video-overlay">
                <span className="cam-icon">🎥</span>
                <span>Press start when you're ready to answer</span>
              </div>
            )}
          </div>

          {!recording ? (
            <button
              className="btn btn-primary"
              onClick={startRecording}
              disabled={analyzing}
            >
              Start Recording
            </button>
          ) : (
            <button className="btn btn-stop" onClick={stopRecording}>
              <span className="rec-dot"></span> Stop Recording
            </button>
          )}

          {analyzing && (
            <div className="status">
              <span className="spinner"></span> Analyzing your answer...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;