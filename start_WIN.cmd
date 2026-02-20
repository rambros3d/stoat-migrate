@echo off
setlocal enabledelayedexpansion

echo === 🚀 Discord Terminator Windows Launcher ===

:: Configuration
set NODE_VERSION=v22.12.0
set NODE_DIST=node-%NODE_VERSION%-win-x64
set NODE_URL=https://nodejs.org/dist/%NODE_VERSION%/%NODE_DIST%.zip
set RUNTIME_DIR=.node_runtime

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

:: 2. Build Frontend (if not already built in src\backend\frontend_dist)
if not exist "src\backend\frontend_dist" (
    echo === 📦 Building Frontend ===
    cd src\frontend
    call npm install
    call npm run build
    cd ..\backend
    if not exist "frontend_dist" mkdir "frontend_dist"
    xcopy /E /I /Y ..\frontend\dist\* frontend_dist\
    cd ..\..
)

:: 3. Install Backend Dependencies
echo === 📦 Installing Backend Dependencies ===
cd src\backend
call npm install
cd ..\..

:: 4. Start Application
echo === 🔥 Starting Application ===
cd src\backend
node server.js

pause
