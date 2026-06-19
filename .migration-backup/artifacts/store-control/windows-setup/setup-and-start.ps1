# Store Control - Windows Setup & Start Script
# Run with: Right-click > "Run with PowerShell"
# Or from PowerShell terminal: .\setup-and-start.ps1

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Store Control - Offline Inventory Manager" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
try {
    $nodeVersion = (node --version 2>&1).ToString()
    Write-Host "[OK] Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js is not installed." -ForegroundColor Red
    Write-Host "Please download and install Node.js LTS from:" -ForegroundColor Yellow
    Write-Host "  https://nodejs.org/en/download" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Check / install pnpm
try {
    $pnpmVersion = (pnpm --version 2>&1).ToString()
    Write-Host "[OK] pnpm found: $pnpmVersion" -ForegroundColor Green
} catch {
    Write-Host "[INFO] Installing pnpm package manager..." -ForegroundColor Yellow
    npm install -g pnpm
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install pnpm. Try running PowerShell as Administrator." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "[OK] pnpm installed." -ForegroundColor Green
}

# Resolve paths
# Script is at: <root>/artifacts/store-control/windows-setup/setup-and-start.ps1
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path   # windows-setup/
$artifactDir = Split-Path -Parent $scriptDir                       # store-control/
$artifactsDir = Split-Path -Parent $artifactDir                   # artifacts/
$workspaceRoot = Split-Path -Parent $artifactsDir                  # project root

Write-Host "[INFO] Workspace root: $workspaceRoot" -ForegroundColor Gray
Set-Location $workspaceRoot

# Install dependencies from workspace root
Write-Host ""
Write-Host "[INFO] Installing dependencies..." -ForegroundColor Yellow
pnpm install --filter "@workspace/store-control..."
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Dependency installation failed." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Dependencies ready." -ForegroundColor Green

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Starting server at http://localhost:3000" -ForegroundColor Green
Write-Host "  Opening browser automatically..." -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Open browser after a short delay
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:3000"
} | Out-Null

# Start dev server from artifact directory
Set-Location $artifactDir
pnpm run dev:standalone
