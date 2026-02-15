#!/bin/bash

# Discord Terminator - Easy Startup Script
# This script builds the frontend and starts both backend and frontend

set -e

echo "🛡️  Discord Terminator - Starting up..."
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.11 or higher."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
fi

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip install -q -r requirements.txt
pip install -q fastapi uvicorn[standard]

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd web/frontend
npm install --silent

# Build frontend
echo "🔨 Building frontend..."
npm run build

# Go back to root
cd ../..

echo ""
echo "✅ Setup complete!"
echo ""
echo "🚀 Starting Discord Terminator..."
echo "   Access the app at: http://localhost:8000"
echo ""
echo "   Press Ctrl+C to stop the server"
echo ""

# Start the backend (which now serves the built frontend)
python -m uvicorn web.backend.main:app --host 0.0.0.0 --port 8000
