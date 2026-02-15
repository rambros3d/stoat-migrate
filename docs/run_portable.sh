#!/bin/bash
set -e

# Configuration
NODE_VERSION="v20.11.0"
NODE_DIST="node-$NODE_VERSION-linux-x64"
NODE_URL="https://nodejs.org/dist/$NODE_VERSION/$NODE_DIST.tar.xz"
RUNTIME_DIR=".node_runtime"

echo "=== 🚀 Setting up Portable Environment ==="

# 1. Download and Extract Node.js if not present
if [ ! -d "$RUNTIME_DIR/$NODE_DIST" ]; then
    echo "Downloading Node.js $NODE_VERSION..."
    mkdir -p "$RUNTIME_DIR"
    curl -o "$RUNTIME_DIR/node.tar.xz" "$NODE_URL"
    
    echo "Extracting Node.js..."
    tar -xJf "$RUNTIME_DIR/node.tar.xz" -C "$RUNTIME_DIR"
    rm "$RUNTIME_DIR/node.tar.xz"
else
    echo "✅ Node.js already downloaded."
fi

# 2. Setup PATH
export PATH="$(pwd)/$RUNTIME_DIR/$NODE_DIST/bin:$PATH"
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# 3. Install Python Dependencies
echo "=== 🐍 Installing Python Dependencies ==="
if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
else
    echo "⚠️ requirements.txt not found!"
fi

# 4. Install Frontend Dependencies
echo "=== 📦 Installing Frontend Dependencies ==="
if [ -d "web/frontend" ]; then
    cd web/frontend
    npm install
    
    # 5. Build Frontend
    echo "=== 🏗️ Building Frontend ==="
    npm run build
    
    cd ../..
else
    echo "⚠️ web/frontend directory not found!"
fi

# 6. Start Backend
echo "=== 🔥 Starting Application ==="
# Ensure the backend can find the frontend build
export PYTHONUNBUFFERED=1
python3 -m uvicorn web.backend.main:app --host 0.0.0.0 --port 8000
