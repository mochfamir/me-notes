// backend/server.js
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();

// Increase body size limits for large audio files
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Configure multer with increased file size limit (200MB)
const upload = multer({ 
  dest: "tmp/",
  limits: { 
    fileSize: 200 * 1024 * 1024 // 200MB max
  }
});

app.use(cors());

// Helper function to clean up files safely
function cleanupFiles(...files) {
  files.forEach(file => {
    if (file && fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (err) {
        console.error(`Failed to cleanup ${file}:`, err);
      }
    }
  });
}

app.post("/transcribe", upload.single("audio"), async (req, res) => {
  // Set longer timeout for processing (10 minutes)
  req.setTimeout(600000);
  
  const inputPath = req.file?.path;
  const wavPath = inputPath ? inputPath + ".wav" : null;

  if (!inputPath || !req.file) {
    return res.status(400).json({ error: "No audio file provided" });
  }

  try {
    console.log(`Processing audio file: ${req.file.originalname || 'chunk'}, size: ${req.file.size} bytes`);

    // Convert to WAV 16kHz mono with better error handling
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("FFmpeg conversion timeout"));
      }, 300000); // 5 minute timeout for conversion

      execFile(
        "ffmpeg",
        ["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", wavPath],
        { maxBuffer: 50 * 1024 * 1024 }, // 50MB buffer
        (err) => {
          clearTimeout(timeout);
          if (err) {
            console.error("FFmpeg conversion error:", err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

    const whisperBin = path.join(__dirname, "whisper.cpp", "build", "bin", "whisper-cli");
    const modelPath = path.join(__dirname, "whisper.cpp", "models", "ggml-base.bin");

    // Check if model file exists
    if (!fs.existsSync(modelPath)) {
      cleanupFiles(inputPath, wavPath);
      console.error(`Model file not found: ${modelPath}`);
      return res.status(500).json({ 
        error: "Model file not found. Please download ggml-base.bin",
        details: "Run: cd backend/whisper.cpp/models && bash download-ggml-model.sh base"
      });
    }

    // Check if whisper binary exists
    if (!fs.existsSync(whisperBin)) {
      cleanupFiles(inputPath, wavPath);
      console.error(`Whisper binary not found: ${whisperBin}`);
      return res.status(500).json({ 
        error: "Whisper binary not found. Please build whisper.cpp first"
      });
    }

    // Get language from query parameter or use auto-detect
    const language = req.query.language || "auto";

    console.log(`Transcribing with language: ${language}`);

    // Run whisper.cpp with language support and timeout
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanupFiles(inputPath, wavPath);
        reject(new Error("Whisper processing timeout"));
      }, 540000); // 9 minute timeout for transcription

      execFile(
        whisperBin,
        ["-m", modelPath, "-f", wavPath, "-l", language, "--no-prints"],
        { maxBuffer: 10 * 1024 * 1024 }, // 10MB buffer for output
        (err, stdout, stderr) => {
          clearTimeout(timeout);

          if (err) {
            console.error("Whisper Error:", err);
            console.error("Whisper Stderr:", stderr);
            cleanupFiles(inputPath, wavPath);
            reject(err);
            return;
          }

          const transcript = stdout.trim();
          console.log(`Transcription successful, length: ${transcript.length} characters`);
          
          // Clean up files after successful transcription
          cleanupFiles(inputPath, wavPath);
          
          res.json({ 
            transcript: transcript,
            language: language
          });
          resolve();
        }
      );
    });
  } catch (e) {
    cleanupFiles(inputPath, wavPath);
    console.error("Transcription error:", e);
    
    // Provide more detailed error messages
    let errorMessage = "Internal error";
    if (e.message?.includes("timeout")) {
      errorMessage = "Processing timeout - file may be too large or processing took too long";
    } else if (e.message?.includes("ENOENT")) {
      errorMessage = "Required tool (ffmpeg or whisper-cli) not found";
    } else if (e.message) {
      errorMessage = e.message;
    }
    
    return res.status(500).json({ 
      error: errorMessage,
      details: e.toString()
    });
  }
});

app.listen(3000, () => console.log("Backend running on http://localhost:3000"));
