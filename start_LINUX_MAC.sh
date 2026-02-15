#!/bin/bash
set -e

# Configuration
NODE_VERSION="v22.12.0"
NODE_DIST="node-$NODE_VERSION-linux-x64"
NODE_URL="https://nodejs.org/dist/$NODE_VERSION/$NODE_DIST.tar.xz"
RUNTIME_DIR=".node_runtime"
VENV_DIR=".venv"

echo "=== 🚀 Discord Terminator Universal Launcher ==="

# --- Helper Functions ---
check_docker() {
    if command -v docker &> /dev/null && docker ps &> /dev/null; then
        return 0
    fi
    return 1
}

check_podman() {
    if command -v podman &> /dev/null && podman ps &> /dev/null; then
        return 0
    fi
    return 1
}

# --- Step 0: Parse Arguments ---
LAUNCH_MODE="browser"
for arg in "$@"; do
    if [ "$arg" == "--desktop" ]; then
        LAUNCH_MODE="desktop"
    fi
done

# --- Step 1: Try Container Runtimes (Browser Mode Only) ---
if [ "$LAUNCH_MODE" == "browser" ]; then
    if check_docker; then
        echo "🐳 Docker is available and running."
        echo "Starting with Docker Compose..."
        if docker compose version &> /dev/null; then
            docker compose up -d --build
        else
            docker-compose up -d --build
        fi
        echo "✅ App running at http://localhost:8000"
        exit 0
    elif check_podman; then
        echo "🦭 Podman is available and running."
        echo "Starting with Podman Compose..."
        if command -v podman-compose &> /dev/null; then
            podman-compose up -d --build
        elif podman compose version &> /dev/null; then
            podman compose up -d --build
        else
            echo "⚠️ podman-compose not found, falling back to portable mode."
        fi
        # If podman-compose succeeds, we exit. If not, continue to fallback.
        if [ $? -eq 0 ]; then
             echo "✅ App running at http://localhost:8000"
             exit 0
        fi
    fi
fi

# --- Step 2: Fallback to Portable Mode ---
if [ "$LAUNCH_MODE" == "desktop" ]; then
    echo "🖥️ Starting in Desktop Mode..."
else
    echo "⚠️ Container runtime not available. Falling back to Portable Mode."
fi

echo "=== 🛠️ Setting up Portable Environment ==="

# 2.1 Setup Node.js
if [ ! -d "$RUNTIME_DIR/$NODE_DIST" ]; then
    echo "📥 Downloading Node.js $NODE_VERSION..."
    mkdir -p "$RUNTIME_DIR"
    curl -o "$RUNTIME_DIR/node.tar.xz" "$NODE_URL"
    
    echo "📦 Extracting Node.js..."
    tar -xJf "$RUNTIME_DIR/node.tar.xz" -C "$RUNTIME_DIR"
    rm "$RUNTIME_DIR/node.tar.xz"
else
    echo "✅ Node.js already downloaded."
fi

# Setup PATH for Node.js
export PATH="$(pwd)/$RUNTIME_DIR/$NODE_DIST/bin:$PATH"
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# 2.2 Install Frontend Dependencies & Build (Browser Mode Only)
if [ "$LAUNCH_MODE" == "browser" ]; then
    echo "=== 📦 Installing & Building Frontend ==="
    if [ -d "src/frontend" ]; then
        cd src/frontend
        npm install
        echo "🏗️ Building Frontend..."
        npm run build
        cd ../..
    else
        echo "⚠️ src/frontend directory not found!"
        exit 1
    fi
fi

# 2.3 Install Backend Dependencies
echo "=== 📦 Installing Backend Dependencies ==="
if [ -d "src/backend" ]; then
    cd src/backend
    npm install
    cd ../..
else
    echo "⚠️ src/backend directory not found!"
    exit 1
fi

# 2.4 Start Backend
echo "=== 🔥 Starting Application ==="

if [ "$LAUNCH_MODE" == "desktop" ]; then
    echo "🚀 Launching Desktop App..."
    cd src/backend
    npm run electron
else
    echo "✅ App successfully started!"
    echo "👉 Open http://localhost:8000 in your browser"
    echo "Press Ctrl+C to stop."
    cd src/backend
    node server.js
fi
