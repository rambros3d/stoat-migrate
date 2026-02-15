@echo off
setlocal enabledelayedexpansion

echo === 🚀 Discord Terminator Windows Launcher ===

:: Configuration
set NODE_VERSION=v22.12.0
set NODE_DIST=node-%NODE_VERSION-win-x64
set NODE_URL=https://nodejs.org/dist/%NODE_VERSION%/%NODE_DIST%.zip
set RUNTIME_DIR=.node_runtime

:: Check for --desktop flag
set LAUNCH_MODE=browser
if "%1"=="--desktop" set LAUNCH_MODE=desktop

:: 1. Setup Node.js
if not exist "%RUNTIME_DIR%\%NODE_DIST%" (
    echo 📥 Downloading portable Node.js %NODE_VERSION%...
    if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"
    
    :: Use PowerShell to download
    powershell -Command "Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%RUNTIME_DIR%\node.zip'"
    
    echo 📦 Extracting Node.js...
    powershell -Command "Expand-Archive -Path '%RUNTIME_DIR%\node.zip' -DestinationPath '%RUNTIME_DIR%' -Force"
    del "%RUNTIME_DIR%\node.zip"
) else (
    echo ✅ Node.js setup already complete.
)

:: Setup PATH
set PATH=%CD%\%RUNTIME_DIR%\%NODE_DIST%;%PATH%
echo Node version: 
node -v

:: 2. Install Backend Dependencies
echo === 📦 Installing Dependencies ===
cd src\backend
call npm install
if "%LAUNCH_MODE%"=="desktop" (
    echo 📦 Installing Electron...
    call npm install --save-dev electron
)
cd ..\..

:: 3. Start Application
echo === 🔥 Starting Application ===

if "%LAUNCH_MODE%"=="desktop" (
    echo 🚀 Launching Desktop App...
    cd src\backend
    call npm run electron
) else (
    echo 🏗️ Building Frontend...
    cd src\frontend
    call npm install
    call npm run build
    cd ..\..
    
    echo ✅ App successfully started!
    echo 👉 Open http://localhost:8000 in your browser
    echo Press Ctrl+C to stop.
    cd src\backend
    node server.js
)

pause
