// Preload script for Electron
// This runs in a context that has access to Node.js APIs
// but the renderer process (React app) doesn't

const { contextBridge } = require('electron');

// Expose protected methods that allow the renderer process to use
// the APIs without exposing the entire Node.js API
contextBridge.exposeInMainWorld('electronAPI', {
  // Add any Electron-specific APIs here if needed in the future
  platform: process.platform,
});

