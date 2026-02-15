@echo off
setlocal EnableDelayedExpansion

REM Discord Terminator - Universal Launcher for Windows
REM This script mimics start_app.sh: Checks for Docker, falls back to portable Node/Python

echo ===================================================
echo 🚀 Discord Terminator Universal Launcher (Windows)
echo ===================================================
echo.

REM --- Step 1: Check for Docker ---
docker info >nul 2>&1
if %ERRORLEVEL% EQ 0 (
    echo 🐳 Docker is available and running.
    echo Starting with Docker Compose...
    
    docker compose version >nul 2>&1
    if %ERRORLEVEL% EQ 0 (
        docker compose up -d --build
    ) else (
        docker-compose up -d --build
    )
    
    if %ERRORLEVEL% EQ 0 (
        echo.
        echo ✅ App running at http://localhost:8000
        goto :EOF
    ) else (
        echo ❌ Docker launch failed. Falling back to portable mode...
    )
) else (
    REM Check for Podman
    podman info >nul 2>&1
    if %ERRORLEVEL% EQ 0 (
        echo 🦭 Podman is available and running.
        echo Starting with Podman Compose...
        
        podman compose version >nul 2>&1
        if %ERRORLEVEL% EQ 0 (
            podman compose up -d --build
        ) else (
            podman-compose up -d --build
        )
        
        if %ERRORLEVEL% EQ 0 (
            echo.
            echo ✅ App running at http://localhost:8000
            goto :EOF
        ) else (
            echo ⚠️ Podman launch failed. Falling back to portable mode...
        )
    ) else (
        echo ⚠️ Container runtime not found. Falling back to Portable Mode.
    )
)

REM --- Step 2: Portable Mode Fallback ---
echo.
echo === 🛠️ Setting up Portable Environment ===

REM 2.1 Setup Python Virtual Environment
if not exist ".venv" (
    echo 🐍 Creating Python virtual environment...
    python -m venv .venv
    if %ERRORLEVEL% NEQ 0 (
        echo ❌ Failed to create python venv. Make sure Python 3 is installed and in your PATH.
        echo    Download Python here: https://www.python.org/downloads/
        pause
        exit /b 1
    )
)

REM Activate venv settings for this session
call .venv\Scripts\activate.bat

REM Ensure pip
echo 📦 Ensuring pip is installed...
python -m ensurepip --upgrade >nul 2>&1
python -m pip install --upgrade pip >nul 2>&1

REM 2.2 Setup Node.js (Portable)
set "NODE_VERSION=v22.12.0"
set "NODE_DIST=node-%NODE_VERSION%-win-x64"
set "NODE_ZIP=%NODE_DIST%.zip"
set "NODE_URL=https://nodejs.org/dist/%NODE_VERSION%/%NODE_ZIP%"
set "RUNTIME_DIR=.node_runtime"

if not exist "%RUNTIME_DIR%\%NODE_DIST%" (
    if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"
    
    echo 📥 Downloading Node.js %NODE_VERSION%...
    REM PowerShell download
    powershell -Command "Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%RUNTIME_DIR%\%NODE_ZIP%'"
    
    echo 📦 Extracting Node.js...
    powershell -Command "Expand-Archive -Path '%RUNTIME_DIR%\%NODE_ZIP%' -DestinationPath '%RUNTIME_DIR%' -Force"
    del "%RUNTIME_DIR%\%NODE_ZIP%"
) else (
    echo ✅ Node.js already downloaded.
)

REM Setup PATH for Node (current session only)
set "PATH=%CD%\%RUNTIME_DIR%\%NODE_DIST%;%PATH%"
echo Node version: 
node -v
echo NPM version: 
call npm -v

REM 2.3 Install Python Dependencies
echo.
echo === 🐍 Installing Python Dependencies ===
if exist "requirements.txt" (
    pip install -r requirements.txt
) else (
    echo ⚠️ requirements.txt not found!
    exit /b 1
)

REM 2.4 Install Frontend Dependencies & Build
echo.
echo === 📦 Installing ^& Building Frontend ===
if exist "src\frontend" (
    cd src\frontend
    
    REM Always ensure dependencies
    call npm install
    
    echo 🏗️ Building Frontend...
    call npm run build
    
    cd ..\..
) else (
    echo ⚠️ src\frontend directory not found!
    exit /b 1
)

REM 2.5 Start Backend
echo.
echo === 🔥 Starting Application ===
echo ✅ App successfully started!
echo 👉 Open http://localhost:8000 in your browser
echo.
echo Press Ctrl+C to stop.
echo.

set PYTHONUNBUFFERED=1
python -m uvicorn src.backend.main:app --host 0.0.0.0 --port 8000
