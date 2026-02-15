@echo off
REM Discord Terminator - Easy Startup Script for Windows
REM This script builds the frontend and starts the backend

echo 🛡️  Discord Terminator - Starting up...
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python is not installed. Please install Python 3.11 or higher.
    pause
    exit /b 1
)

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed. Please install Node.js 18 or higher.
    pause
    exit /b 1
)

REM Install Python dependencies
echo 📦 Installing Python dependencies...
pip install -q -r requirements.txt
pip install -q fastapi uvicorn[standard]

REM Install frontend dependencies
echo 📦 Installing frontend dependencies...
cd web\frontend
call npm install --silent

REM Build frontend
echo 🔨 Building frontend...
call npm run build

REM Go back to root
cd ..\..

echo.
echo ✅ Setup complete!
echo.
echo 🚀 Starting Discord Terminator...
echo    Access the app at: http://localhost:8000
echo.
echo    Press Ctrl+C to stop the server
echo.

REM Start the backend (which now serves the built frontend)
python -m uvicorn web.backend.main:app --host 0.0.0.0 --port 8000
