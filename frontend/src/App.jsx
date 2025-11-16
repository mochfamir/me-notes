import { useState, useRef, useEffect } from "react";

function App() {
  const [recording, setRecording] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const [language, setLanguage] = useState("auto"); // "auto", "en", or "id"
  const [processing, setProcessing] = useState(false);
  const [processingChunk, setProcessingChunk] = useState(0);
  const [errors, setErrors] = useState([]);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunkCounterRef = useRef(0);
  const processingQueueRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const isProcessingRef = useRef(false);

  // Chunk processing interval: 2 minutes (120000ms)
  const CHUNK_INTERVAL_MS = 2 * 60 * 1000;
  const MAX_RETRIES = 3;

  // Process a single chunk with retry logic
  async function processChunk(blob, chunkNumber, retries = MAX_RETRIES) {
    const fd = new FormData();
    fd.append("audio", blob, `chunk-${chunkNumber}.webm`);
    const url = `http://localhost:3000/transcribe?language=${language}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        setProcessingChunk(chunkNumber);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minute timeout

        const res = await fetch(url, {
          method: "POST",
          body: fd,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }

        const json = await res.json();
        
        if (json.transcript && json.transcript.trim()) {
          setTranscripts((t) => [
            ...t,
            {
              text: json.transcript,
              chunk: chunkNumber,
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);
          setErrors((e) => e.filter((err) => err.chunk !== chunkNumber));
          return json;
        } else {
          throw new Error("Empty transcript received");
        }
      } catch (err) {
        if (attempt === retries) {
          const errorMsg = err.name === "AbortError" 
            ? "Request timeout" 
            : err.message || "Unknown error";
          
          setErrors((e) => [
            ...e,
            {
              chunk: chunkNumber,
              error: errorMsg,
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);
          console.error(`Failed to process chunk ${chunkNumber} after ${retries} attempts:`, err);
          throw err;
        }
        
        // Exponential backoff: wait 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  // Process queued chunks sequentially to avoid overwhelming the server
  async function processQueue() {
    if (processingQueueRef.current.length === 0) {
      isProcessingRef.current = false;
      setProcessing(false);
      return;
    }

    isProcessingRef.current = true;
    setProcessing(true);
    const { blob, chunkNumber } = processingQueueRef.current.shift();

    try {
      await processChunk(blob, chunkNumber);
    } catch (err) {
      // Error already logged in processChunk
    }

    // Process next chunk in queue
    if (processingQueueRef.current.length > 0) {
      setTimeout(() => processQueue(), 500); // Small delay between chunks
    } else {
      isProcessingRef.current = false;
      setProcessing(false);
      setProcessingChunk(0);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      
      streamRef.current = stream;
      
      // Use timeslice to get chunks every 2 minutes
      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      chunkCounterRef.current = 0;
      processingQueueRef.current = [];

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          chunkCounterRef.current++;
          const chunkNumber = chunkCounterRef.current;
          const blob = new Blob([e.data], { type: "audio/webm" });

          // Add to processing queue
          processingQueueRef.current.push({ blob, chunkNumber });
          
          // Start processing if not already processing
          if (!isProcessingRef.current) {
            processQueue();
          }
        }
      };

      recorder.onerror = (e) => {
        console.error("MediaRecorder error:", e);
        setErrors((errs) => [
          ...errs,
          {
            chunk: 0,
            error: "Recording error occurred",
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      };

      recorder.onstop = () => {
        // Final chunk will be processed via ondataavailable
        // Just ensure queue is processed
        if (processingQueueRef.current.length > 0 && !isProcessingRef.current) {
          processQueue();
        }
      };

      // Start recording with timeslice for chunked processing
      recorder.start(CHUNK_INTERVAL_MS);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordingTime(0);
      setTranscripts([]);
      setErrors([]);

      // Start recording timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
      alert(`Failed to start recording: ${err.message}`);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    setRecording(false);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif", maxWidth: 1200, margin: "0 auto" }}>
      <h1>Meeting Speech-to-Text (Local Whisper)</h1>
      <p style={{ color: "#666", fontSize: "14px" }}>
        Optimized for long meetings. Processes audio in 2-minute chunks for real-time transcription.
      </p>

      <div style={{ marginBottom: 20, display: "flex", gap: 15, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <label style={{ marginRight: 10, fontWeight: "500" }}>
            Language: 
          </label>
          <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value)}
            disabled={recording}
            style={{ 
              padding: "8px 12px", 
              fontSize: "14px",
              border: "1px solid #ddd",
              borderRadius: "4px",
              cursor: recording ? "not-allowed" : "pointer"
            }}
          >
            <option value="auto">Auto-detect (English/Indonesian)</option>
            <option value="en">English</option>
            <option value="id">Indonesian</option>
          </select>
        </div>

        <button 
          onClick={recording ? stopRecording : startRecording}
          style={{
            padding: "10px 20px",
            fontSize: "16px",
            fontWeight: "bold",
            backgroundColor: recording ? "#dc3545" : "#28a745",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            transition: "background-color 0.2s"
          }}
          onMouseOver={(e) => {
            if (!recording) e.target.style.backgroundColor = "#218838";
            else e.target.style.backgroundColor = "#c82333";
          }}
          onMouseOut={(e) => {
            if (!recording) e.target.style.backgroundColor = "#28a745";
            else e.target.style.backgroundColor = "#dc3545";
          }}
        >
          {recording ? "⏹ Stop Recording" : "⏺ Start Recording"}
        </button>

        {recording && (
          <div style={{ 
            padding: "8px 15px", 
            backgroundColor: "#fff3cd", 
            border: "1px solid #ffc107",
            borderRadius: "4px",
            fontWeight: "500"
          }}>
            ⏱ Recording: {formatTime(recordingTime)}
          </div>
        )}
      </div>

      {processing && (
        <div style={{ 
          marginBottom: 15, 
          padding: "10px 15px", 
          backgroundColor: "#d1ecf1", 
          border: "1px solid #bee5eb",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          gap: 10
        }}>
          <span style={{ animation: "spin 1s linear infinite" }}>⏳</span>
          <span>Processing chunk {processingChunk}...</span>
        </div>
      )}

      {errors.length > 0 && (
        <div style={{ 
          marginBottom: 15, 
          padding: "10px 15px", 
          backgroundColor: "#f8d7da", 
          border: "1px solid #f5c6cb",
          borderRadius: "4px"
        }}>
          <strong style={{ color: "#721c24" }}>⚠ Errors ({errors.length}):</strong>
          <ul style={{ margin: "5px 0 0 0", paddingLeft: 20, color: "#721c24" }}>
            {errors.slice(-5).map((err, i) => (
              <li key={i} style={{ fontSize: "13px" }}>
                Chunk {err.chunk}: {err.error} ({err.timestamp})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 10 }}>
          Transcripts {transcripts.length > 0 && `(${transcripts.length} chunks)`}
        </h3>

        {transcripts.length === 0 && !recording && (
          <div style={{ 
            padding: 40, 
            textAlign: "center", 
            color: "#999",
            border: "2px dashed #ddd",
            borderRadius: "5px"
          }}>
            No transcripts yet. Start recording to begin transcription.
          </div>
        )}

        <div style={{ 
          whiteSpace: "pre-wrap", 
          border: "1px solid #ddd", 
          padding: 15,
          borderRadius: "5px",
          backgroundColor: "#f9f9f9",
          maxHeight: "500px",
          overflowY: "auto"
        }}>
          {transcripts.map((t, i) => (
            <div 
              key={i} 
              style={{ 
                marginBottom: 15,
                paddingBottom: 15,
                borderBottom: i < transcripts.length - 1 ? "1px solid #eee" : "none"
              }}
            >
              <div style={{ 
                fontSize: "12px", 
                color: "#666", 
                marginBottom: "5px",
                fontWeight: "500"
              }}>
                Chunk {t.chunk} • {t.timestamp}
              </div>
              <div style={{ fontSize: "15px", lineHeight: "1.6" }}>
                {t.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default App;
