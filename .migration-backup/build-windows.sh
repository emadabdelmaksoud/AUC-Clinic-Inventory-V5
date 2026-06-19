#!/usr/bin/env bash
# ============================================================
#  Store Control — Windows Desktop App Builder
#  Run by right-clicking this file > "Open with Git Bash"
# ============================================================

set -e  # stop on any error

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARTIFACT_DIR="$SCRIPT_DIR/artifacts/store-control"
OUTPUT_DIR="$ARTIFACT_DIR/dist/electron"

echo ""
echo -e "${CYAN}================================================${NC}"
echo -e "${CYAN}   Store Control — Build Windows Desktop App${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""

# ── Step 1: Install workspace dependencies ───────────────────
echo -e "${YELLOW}[1/4] Installing dependencies...${NC}"
cd "$SCRIPT_DIR"
pnpm install --ignore-scripts
echo -e "${GREEN}      ✓ Dependencies installed${NC}"
echo ""

# ── Step 2: Install Electron ─────────────────────────────────
echo -e "${YELLOW}[2/4] Installing Electron (first run downloads ~100 MB)...${NC}"
cd "$ARTIFACT_DIR"
pnpm add -D electron electron-builder
echo -e "${GREEN}      ✓ Electron installed${NC}"
echo ""

# ── Step 3: Build the web app ─────────────────────────────────
echo -e "${YELLOW}[3/4] Building the app...${NC}"
pnpm run build:electron
echo -e "${GREEN}      ✓ App built${NC}"
echo ""

# ── Step 4: Package as Windows EXE ───────────────────────────
echo -e "${YELLOW}[4/4] Packaging as Windows installer + portable EXE...${NC}"
pnpm exec electron-builder --config electron-builder.json --win
echo ""

# ── Done ──────────────────────────────────────────────────────
echo -e "${CYAN}================================================${NC}"
echo -e "${GREEN}  ✓ Done! Your files are ready:${NC}"
echo ""
echo -e "  ${CYAN}Installer:${NC} Store Control Setup 1.0.0.exe"
echo -e "  ${CYAN}Portable:${NC}  Store Control 1.0.0.exe"
echo ""
echo -e "  Folder: ${YELLOW}artifacts/store-control/dist/electron/${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""

# Open the output folder in File Explorer
explorer.exe "$(cygpath -w "$OUTPUT_DIR")" 2>/dev/null || true

read -p "Press Enter to close..."
