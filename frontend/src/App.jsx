import { useState, useRef } from "react";

function App() {
  const [recording, setRecording] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const [language, setLanguage] = useState("auto"); // "auto", "en", or "id"

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      chunksRef.current = [];

      const fd = new FormData();
      fd.append("audio", blob, "meeting.webm");

      // Send language parameter (auto-detect is default)
      const url = `http://localhost:3000/transcribe?language=${language}`;

      const res = await fetch(url, {
        method: "POST",
        body: fd,
      });

      const json = await res.json();
      setTranscripts((t) => [...t, json.transcript]);
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current.stop();
    setRecording(false);
  }

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Meeting Speech-to-Text (Local Whisper)</h1>

      <div style={{ marginBottom: 15 }}>
        <label style={{ marginRight: 10 }}>
          Language: 
        </label>
        <select 
          value={language} 
          onChange={(e) => setLanguage(e.target.value)}
          disabled={recording}
          style={{ padding: "5px 10px", fontSize: "14px" }}
        >
          <option value="auto">Auto-detect (English/Indonesian)</option>
          <option value="en">English</option>
          <option value="id">Indonesian</option>
        </select>
      </div>

      <button onClick={recording ? stopRecording : startRecording}>
        {recording ? "Stop Recording" : "Start Recording"}
      </button>

      <h3>Transcripts:</h3>

      <div style={{ whiteSpace: "pre-wrap", border: "1px solid #ddd", padding: 10 }}>
        {transcripts.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
      </div>
    </div>
  );
}

export default App;
