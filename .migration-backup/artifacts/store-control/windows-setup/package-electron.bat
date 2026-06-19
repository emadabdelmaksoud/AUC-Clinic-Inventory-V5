@echo off
title Store Control - Package Windows App (.exe)
echo ================================================
echo   Store Control - Build Windows Desktop App
echo ================================================
echo.

REM Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo Please install from https://nodejs.org (LTS version)
    pause & exit /b 1
)

REM Check / install pnpm
pnpm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing pnpm...
    npm install -g pnpm
)

REM Navigate to workspace root
cd /d "%~dp0..\..\..\"
echo [INFO] Workspace root: %CD%

REM Install workspace deps (--ignore-scripts bypasses Linux-only esbuild postinstall)
echo [INFO] Installing workspace dependencies...
pnpm install --ignore-scripts
if %errorlevel% neq 0 (
    echo [ERROR] Dependency installation failed.
    pause & exit /b 1
)

REM Go to artifact dir
cd /d "%~dp0..\"
echo [INFO] Artifact dir: %CD%

REM Install electron (runs its own download script separately - this is fine)
echo.
echo [INFO] Installing Electron (first run downloads ~100 MB, please wait)...
pnpm add -D electron electron-builder --ignore-scripts=false
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Electron.
    pause & exit /b 1
)

REM Download the electron binary explicitly
echo [INFO] Downloading Electron binary...
node node_modules/electron/install.js 2>nul || node -e "require('electron')" 2>nul
pnpm exec electron --version >nul 2>&1

REM Build the web app with Electron config (relative paths)
echo.
echo [INFO] Building web app for Electron...
pnpm run build:electron
if %errorlevel% neq 0 (
    echo [ERROR] Web build failed.
    pause & exit /b 1
)

REM Package
echo.
echo [INFO] Packaging as Windows installer and portable EXE...
pnpm exec electron-builder --config electron-builder.json --win

echo.
echo ================================================
echo   Done!
echo   Output: artifacts\store-control\dist\electron\
echo ================================================
pause
