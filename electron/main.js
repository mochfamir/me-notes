const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { execFile } = require('child_process');
const fs = require('fs');

let mainWindow;
let backendServer;

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

// Start Express backend server
function startBackendServer() {
  const expressApp = express();

  // Increase body size limits for large audio files
  expressApp.use(express.json({ limit: '200mb' }));
  expressApp.use(express.urlencoded({ extended: true, limit: '200mb' }));

  // Configure multer with increased file size limit (200MB)
  const upload = multer({ 
    dest: path.join(app.getPath('userData'), 'tmp'),
    limits: { 
      fileSize: 200 * 1024 * 1024 // 200MB max
    }
  });

  expressApp.use(cors());

  expressApp.post("/transcribe", upload.single("audio"), async (req, res) => {
    // Set longer timeout for processing (10 minutes)
    req.setTimeout(600000);
    
    const inputPath = req.file?.path;
    const wavPath = inputPath ? inputPath + ".wav" : null;

    if (!inputPath || !req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    try {
      console.log(`Processing audio file: ${req.file.originalname || 'chunk'}, size: ${req.file.size} bytes`);

      // Get paths relative to app resources
      const isDev = !app.isPackaged;
      let ffmpegPath = 'ffmpeg';
      let whisperBin;
      let modelPath;

      if (isDev) {
        // Development mode - use local paths
        whisperBin = path.join(__dirname, '..', 'backend', 'whisper.cpp', 'build', 'bin', 'whisper-cli');
        modelPath = path.join(__dirname, '..', 'backend', 'whisper.cpp', 'models', 'ggml-base.bin');
      } else {
        // Production mode - use bundled resources
        whisperBin = path.join(process.resourcesPath, 'whisper-cli');
        modelPath = path.join(process.resourcesPath, 'models', 'ggml-base.bin');
        
        // Try to find ffmpeg in resources or use system ffmpeg
        const ffmpegResource = path.join(process.resourcesPath, 'ffmpeg');
        if (process.platform === 'win32') {
          const ffmpegExe = ffmpegResource + '.exe';
          if (fs.existsSync(ffmpegExe)) {
            ffmpegPath = ffmpegExe;
          }
        } else if (fs.existsSync(ffmpegResource)) {
          ffmpegPath = ffmpegResource;
        }
      }

      // Convert to WAV 16kHz mono with better error handling
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("FFmpeg conversion timeout"));
        }, 300000); // 5 minute timeout for conversion

        execFile(
          ffmpegPath,
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

      // Check if model file exists
      if (!fs.existsSync(modelPath)) {
        cleanupFiles(inputPath, wavPath);
        console.error(`Model file not found: ${modelPath}`);
        return res.status(500).json({ 
          error: "Model file not found. Please ensure ggml-base.bin is included in the app bundle.",
        });
      }

      // Check if whisper binary exists
      if (!fs.existsSync(whisperBin)) {
        cleanupFiles(inputPath, wavPath);
        console.error(`Whisper binary not found: ${whisperBin}`);
        return res.status(500).json({ 
          error: "Whisper binary not found. Please ensure whisper-cli is included in the app bundle."
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

  const PORT = 3000;
  backendServer = expressApp.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the frontend
  const isDev = !app.isPackaged;
  if (isDev) {
    // Development: load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load from built files
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startBackendServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (backendServer) {
    backendServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendServer) {
    backendServer.close();
  }
});

