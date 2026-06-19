#!/usr/bin/env bash
# ================================================================
#  Clinic Inventory -- Windows Desktop App Builder
#  Run this in Git Bash on Windows
#  Requirements: Node.js LTS  (https://nodejs.org/)
# ================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/windows-build"

# ── colours (fall back gracefully if terminal doesn't support them) ──
if [ -t 1 ]; then
  GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m';  RED='\033[0;31m'; NC='\033[0m'
else
  GREEN=''; YELLOW=''; CYAN=''; RED=''; NC=''
fi

die() { echo -e "${RED}ERROR: $*${NC}"; echo; read -rp "Press Enter to close..."; exit 1; }

echo -e "${CYAN}"
echo "  =================================================="
echo "    Clinic Inventory  |  Windows Installer Builder"
echo "  =================================================="
echo -e "${NC}"

# ── 1. Check Node.js ──────────────────────────────────────────────
echo -e "${YELLOW}[1/4] Checking Node.js...${NC}"
if ! command -v node &>/dev/null; then
  die "Node.js is not installed.\n\n  Download and install Node.js LTS from:\n    https://nodejs.org/\n\n  Then run this script again."
fi
NODE_VER="$(node --version)"
echo -e "      Node.js ${NODE_VER} found."
echo

if ! command -v npm &>/dev/null; then
  die "npm is not installed (it normally ships with Node.js).\n  Re-install Node.js from https://nodejs.org/"
fi

# ── 2. Ensure app files are present ──────────────────────────────
echo -e "${YELLOW}[2/4] Checking app files...${NC}"

if [ -f "$BUILD_DIR/dist/public/index.html" ]; then
  echo "      Pre-built app files found. Ready to package."
else
  echo "      Pre-built files missing. Attempting to rebuild..."

  # Need pnpm + workspace for a fresh build
  if ! command -v pnpm &>/dev/null; then
    die "App files missing and pnpm is not installed.\n\n  The quickest fix: re-download the project from Replit.\n  The pre-built files should be in windows-build/dist/public/."
  fi

  echo "      Running Vite build..."
  cd "$SCRIPT_DIR"
  pnpm --filter @workspace/store-control run build:electron
  mkdir -p "$BUILD_DIR/dist"
  cp -r "$SCRIPT_DIR/artifacts/store-control/dist/public" "$BUILD_DIR/dist/public"
  echo "      Built successfully."
fi
echo

# ── 3. Install Electron build tools ──────────────────────────────
echo -e "${YELLOW}[3/4] Installing Electron build tools...${NC}"
echo "      (First run downloads ~120 MB — please wait)"
cd "$BUILD_DIR"
npm install
echo -e "      ${GREEN}Done.${NC}"
echo

# ── 4. Build Windows installer ───────────────────────────────────
echo -e "${YELLOW}[4/4] Building Windows installer...${NC}"
npx electron-builder --win --config electron-builder.json
echo

# ── Done ──────────────────────────────────────────────────────────
OUTPUT_DIR="$BUILD_DIR/dist/electron"
echo -e "${CYAN}"
echo "  =================================================="
echo -e "  ${GREEN}BUILD COMPLETE!${CYAN}  Your installer is ready:"
echo
if [ -f "$OUTPUT_DIR/Clinic Inventory 1.0.0 Setup.exe" ]; then
  echo "    $OUTPUT_DIR/Clinic Inventory 1.0.0 Setup.exe"
else
  # list whatever was produced
  ls "$OUTPUT_DIR"/*.exe 2>/dev/null || true
fi
echo
echo "  Run the Setup.exe to install on this PC."
echo "  The app will appear in:"
echo "    - Start Menu  (under AUC Clinic)"
echo "    - Desktop shortcut"
echo "    - Settings > Apps > Installed apps"
echo -e "  =================================================="
echo -e "${NC}"

# Open output folder in Explorer
if command -v explorer.exe &>/dev/null; then
  explorer.exe "$(cygpath -w "$OUTPUT_DIR")" 2>/dev/null || true
fi

read -rp "Press Enter to close..."
