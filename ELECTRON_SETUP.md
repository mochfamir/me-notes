# Electron Setup Guide

This guide will help you build an executable file for your Me Notes application using Electron.

## Prerequisites

1. **Node.js** (v16 or higher)
2. **FFmpeg** installed on your system (or bundled with the app)
3. **Whisper.cpp** built and ready (should already be in `backend/whisper.cpp/build/bin/whisper-cli`)
4. **Model file** downloaded (`backend/whisper.cpp/models/ggml-base.bin`)

## Installation Steps

### 1. Install Root Dependencies

From the project root directory, run:

```bash
npm install
```

This will install:
- Electron
- electron-builder (for creating executables)
- Other required dependencies

### 2. Development Mode

To run the app in development mode:

```bash
npm run dev
```

This will:
- Start the Vite dev server for the frontend
- Launch Electron with hot-reload

### 3. Build Executable

To create a distributable executable:

```bash
npm run build
```

This will:
1. Build the React frontend
2. Package everything into an executable using electron-builder

The output will be in the `dist-electron` directory.

## Platform-Specific Builds

### Windows
```bash
npm run build
```
Creates a `.exe` installer in `dist-electron/`

### Linux
```bash
npm run build
```
Creates an `AppImage` in `dist-electron/`

### macOS
```bash
npm run build
```
Creates a `.dmg` file in `dist-electron/`

## Important Notes

### Binary Dependencies

The app requires:
- **whisper-cli**: Should be at `backend/whisper.cpp/build/bin/whisper-cli`
- **ffmpeg**: Should be available in system PATH, or you can bundle it

### Bundling Binaries

For production builds, you may need to:

1. **Bundle FFmpeg**: Download platform-specific FFmpeg binaries and place them in a `build/` directory, then update `electron-builder` config in `package.json` to include them in `extraResources`.

2. **Bundle Whisper**: The current config should automatically include the whisper-cli binary from your build directory.

### Model File

Ensure `ggml-base.bin` is in `backend/whisper.cpp/models/` before building. The build process will include it in the app bundle.

## Troubleshooting

### "whisper-cli not found"
- Make sure you've built whisper.cpp: `cd backend/whisper.cpp && cmake -B build && cmake --build build`
- Check that the binary exists at `backend/whisper.cpp/build/bin/whisper-cli`

### "ffmpeg not found"
- Install FFmpeg on your system, or
- Bundle FFmpeg with the app by adding it to `extraResources` in `package.json`

### "Model file not found"
- Download the model: `cd backend/whisper.cpp/models && bash download-ggml-model.sh base`

## Customization

You can customize the build in `package.json` under the `"build"` section:
- Change app name, ID, or icon
- Modify output directory
- Add/remove files to bundle
- Configure platform-specific options

