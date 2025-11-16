#!/bin/bash
# Download whisper model script
# Downloads the multilingual base model which supports both English and Indonesian

cd whisper.cpp/models

echo "Downloading ggml-base.bin model (multilingual - supports English and Indonesian)..."
bash download-ggml-model.sh base

if [ -f "ggml-base.bin" ]; then
    echo "✓ Model downloaded successfully!"
    echo "  This model supports multiple languages including English (en) and Indonesian (id)"
else
    echo "✗ Model download failed. Please check the error messages above."
    exit 1
fi

