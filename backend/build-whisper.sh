#!/bin/bash
# Build script for whisper.cpp

cd whisper.cpp

# Check if cmake is installed
if ! command -v cmake &> /dev/null; then
    echo "Error: cmake is not installed. Please install it with:"
    echo "  sudo apt-get update && sudo apt-get install -y cmake build-essential"
    exit 1
fi

# Configure build
echo "Configuring whisper.cpp build..."
cmake -B build

# Build the project
echo "Building whisper.cpp (this may take a while)..."
cmake --build build --config Release -j$(nproc)

# Check if build was successful
if [ -f "build/bin/whisper-cli" ]; then
    echo "✓ Build successful! whisper-cli is ready at: build/bin/whisper-cli"
    echo ""
    echo "You can now run your Node.js server."
else
    echo "✗ Build failed. Please check the error messages above."
    exit 1
fi

