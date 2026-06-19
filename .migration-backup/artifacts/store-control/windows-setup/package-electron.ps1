# Store Control - Build Windows Desktop App (.exe)
# Open Git Bash in the project root and run:
#   bash artifacts/store-control/windows-setup/package-electron.sh
# Or right-click this file > "Run with PowerShell"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Store Control - Build Windows Desktop App" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

$scriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$artifactDir   = Split-Path -Parent $scriptDir
$artifactsDir  = Split-Path -Parent $artifactDir
$workspaceRoot = Split-Path -Parent $artifactsDir

Set-Location $workspaceRoot
Write-Host "[INFO] Workspace: $workspaceRoot" -ForegroundColor Gray

# Node check
try { node --version | Out-Null; Write-Host "[OK] Node.js found" -ForegroundColor Green }
catch { Write-Host "[ERROR] Node.js not installed. Get it at https://nodejs.org" -ForegroundColor Red; Read-Host; exit 1 }

# pnpm check / install
try { pnpm --version | Out-Null }
catch { npm install -g pnpm }

# Install workspace dependencies
# --ignore-scripts bypasses Linux-only esbuild postinstall (esbuild still works via optional dep @esbuild/win32-x64)
Write-Host "[INFO] Installing workspace dependencies (--ignore-scripts)..." -ForegroundColor Yellow
pnpm install --ignore-scripts
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] pnpm install failed." -ForegroundColor Red; Read-Host; exit 1
}

# Install Electron in artifact dir
Set-Location $artifactDir
Write-Host "[INFO] Installing Electron (first run ~100 MB download)..." -ForegroundColor Yellow
pnpm add -D electron electron-builder
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Electron install failed." -ForegroundColor Red; Read-Host; exit 1
}

# Build
Write-Host "[INFO] Building web app for Electron..." -ForegroundColor Yellow
pnpm run build:electron
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Web build failed." -ForegroundColor Red; Read-Host; exit 1
}

# Package
Write-Host "[INFO] Packaging as installer + portable EXE..." -ForegroundColor Yellow
pnpm exec electron-builder --config electron-builder.json --win

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Done! EXEs in: $artifactDir\dist\electron\" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Read-Host "Press Enter to exit"
