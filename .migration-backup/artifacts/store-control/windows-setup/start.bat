@echo off
title Store Control - Local Server
echo ================================================
echo   Store Control - Offline Inventory Manager
echo ================================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo Please install Node.js from https://nodejs.org  (LTS version)
    echo Then run this script again.
    pause
    exit /b 1
)

REM Check if pnpm is installed, install if missing
pnpm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing pnpm...
    npm install -g pnpm
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install pnpm. Please run as Administrator.
        pause
        exit /b 1
    )
    echo [OK] pnpm installed.
)

REM Navigate to workspace root (3 levels up from windows-setup folder)
cd /d "%~dp0..\..\..\"

echo [INFO] Working directory: %CD%

REM Install dependencies from workspace root
echo [INFO] Installing dependencies (first run may take a few minutes)...
pnpm install --filter @workspace/store-control...
if %errorlevel% neq 0 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
)

REM Now go to the artifact folder to run the dev server
cd /d "%~dp0..\"

echo.
echo [INFO] Starting Store Control at http://localhost:3000
echo [INFO] Open your browser and go to: http://localhost:3000
echo [INFO] Press Ctrl+C to stop the server.
echo.

pnpm run dev:standalone

pause
