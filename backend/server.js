// backend/server.js
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
const upload = multer({ dest: "tmp/" });

app.use(cors());

app.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    const inputPath = req.file.path;
    const wavPath = inputPath + ".wav";

    // Convert to WAV 16kHz mono
    await new Promise((resolve, reject) => {
      execFile(
        "ffmpeg",
        ["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", wavPath],
        (err) => (err ? reject(err) : resolve())
      );
    });

    const whisperBin = path.join(__dirname, "whisper.cpp", "build", "bin", "whisper-cli");
    // Use multilingual model to support both English and Indonesian
    const modelPath = path.join(__dirname, "whisper.cpp", "models", "ggml-base.bin");

    // Check if model file exists
    if (!fs.existsSync(modelPath)) {
      fs.unlinkSync(inputPath);
      fs.unlinkSync(wavPath);
      console.error(`Model file not found: ${modelPath}`);
      console.error("Please download it by running:");
      console.error("  cd backend/whisper.cpp/models && bash download-ggml-model.sh base");
      return res.status(500).json({ error: "model file not found. Please download ggml-base.bin" });
    }

    // Get language from query parameter or use auto-detect
    // Supported: "en" (English), "id" (Indonesian), "auto" (auto-detect)
    const language = req.query.language || "auto";

    // Run whisper.cpp with language support
    // --language auto will auto-detect between English and Indonesian
    execFile(
      whisperBin,
      ["-m", modelPath, "-f", wavPath, "-l", language, "--no-prints"],
      (err, stdout) => {
        fs.unlinkSync(inputPath);
        fs.unlinkSync(wavPath);

        if (err) {
          console.error("Whisper Error:", err);
          return res.status(500).json({ error: "transcription failed" });
        }

        return res.json({ transcript: stdout.trim() });
      }
    );
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "internal error" });
  }
});

app.listen(3000, () => console.log("Backend running on http://localhost:3000"));
