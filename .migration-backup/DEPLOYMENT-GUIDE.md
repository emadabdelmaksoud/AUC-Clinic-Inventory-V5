# Store Control — Deployment Guide

Complete step-by-step instructions for publishing on **Vercel** (with PWA), running as an **installable PWA**, and packaging as a **native Windows .exe** app via Electron.

---

## Table of Contents

1. [About the App](#about-the-app)
2. [Publishing on Vercel (with PWA)](#publishing-on-vercel-with-pwa)
3. [Installing as a PWA in the Browser](#installing-as-a-pwa-in-the-browser)
4. [Running Locally on Windows (Offline)](#running-locally-on-windows-offline)
5. [Packaging as a Windows Desktop App (.exe)](#packaging-as-a-windows-desktop-app-exe)
6. [Troubleshooting](#troubleshooting)
7. [Quick Reference](#quick-reference)

---

## About the App

Store Control is a **fully offline** inventory management system. All data is stored in your browser's built-in storage (IndexedDB) — no server, no cloud database, no internet connection needed.

- **Default login:** `admin` / `admin123`
- **Warning:** clearing browser storage erases all data. Use **Settings → Export Backup (JSON)** regularly.

---

## Publishing on Vercel (with PWA)

### What you need
- A [GitHub](https://github.com) account (free)
- A [Vercel](https://vercel.com) account (free)

---

### Step 1 — Push the project to GitHub

1. Go to [github.com](https://github.com) → sign in → **New repository**.
2. Name it (e.g. `store-control`) → **Create repository**.
3. In your project folder, open Command Prompt and run:

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/store-control.git
git push -u origin main
```

> If you already pushed before and are updating, just run:
> `git add . && git commit -m "update" && git push`

---

### Step 2 — Import the project in Vercel

1. Go to [vercel.com](https://vercel.com) → sign in → **Add New Project**.
2. Click **Import Git Repository** and select your repo.

---

### Step 3 — Configure settings

> ⚠️ **Leave Root Directory blank (do not set it).** The `vercel.json` at the repo root handles everything automatically.

In the Vercel project screen, leave ALL fields at their defaults:

| Setting | Value |
|---|---|
| **Root Directory** | *(leave blank)* |
| **Framework Preset** | `Other` or auto-detected |
| **Build Command** | *(leave blank — read from vercel.json)* |
| **Output Directory** | *(leave blank — read from vercel.json)* |
| **Install Command** | *(leave blank — read from vercel.json)* |

> **If Root Directory was previously set to `artifacts/store-control`, clear it** (set back to blank) in Vercel → Settings → General → Root Directory → Save → Redeploy.

---

### Step 4 — Deploy

Click **Deploy**. Vercel will install only the Store Control dependencies, build the app, and deploy it. Total time: ~2–3 minutes. You'll get a URL like `https://store-control-abc.vercel.app`.

Every future `git push` to `main` automatically re-deploys.

---

### Step 5 — (Optional) Custom domain

Vercel project → **Settings → Domains** → add your domain → follow the DNS instructions.

---

## Installing as a PWA in the Browser

Once deployed on Vercel (or running locally), users can install it as a native-feeling app.

### On Desktop (Chrome / Edge)

1. Open the app URL.
2. Look for the **install icon** (⊕ or a computer icon) at the right side of the address bar.
3. Click → **Install** → the app opens in its own window with a **black title bar** and the box icon.
4. Appears in the Start Menu and can be pinned to the Taskbar.

### On Mobile (Android / iOS)

**Android (Chrome):** Three-dot menu → **Add to Home Screen** → **Install**

**iOS (Safari):** Share icon → **Add to Home Screen** → **Add**

### PWA features
- Works completely **offline** after first visit (service worker caches all files)
- Black title bar matching the app's dark theme
- Dark navy/box icon in the Start Menu and home screen
- No address bar — looks like a native app
- Data stays 100% local

---

## Running Locally on Windows (Offline)

This runs the app on your Windows PC via a local development server. Works completely offline once set up.

### Step 1 — Install Node.js

1. Go to [nodejs.org](https://nodejs.org/en/download) → download **LTS** for Windows.
2. Run the installer with default settings.
3. Verify: open Command Prompt → `node --version` → should show `v20.x.x` or higher.

---

### Step 2 — Download / extract the project

Extract the project ZIP to a folder, for example `C:\StoreControl\`.

Your folder should look like:
```
C:\StoreControl\
  artifacts\
    store-control\
      windows-setup\
        start.bat          ← double-click to launch
        setup-and-start.ps1
  vercel.json
  pnpm-workspace.yaml
  ...
```

---

### Step 3 — Launch the app

**Easiest — double-click:**
1. Open `C:\StoreControl\artifacts\store-control\windows-setup\`
2. Double-click **`start.bat`**
3. Open your browser → **http://localhost:3000**

The script automatically installs `pnpm` if missing and installs all dependencies on first run (takes 2–5 minutes once).

**PowerShell method (opens browser automatically):**
Right-click **`setup-and-start.ps1`** → **Run with PowerShell**

**Manual:**
```bash
cd C:\StoreControl
npm install -g pnpm
pnpm install --filter "@workspace/store-control..."
cd artifacts\store-control
pnpm run dev:standalone
```

---

### Step 4 — Create a Desktop Shortcut (optional)

1. Right-click `start.bat` → **Send to → Desktop (create shortcut)**
2. Right-click the shortcut → **Properties** → set **Run** to `Minimized`

---

### Stopping the server

Press **Ctrl + C** in the Command Prompt window. Data is safe — it lives in IndexedDB and is not affected by stopping the server.

---

## Packaging as a Windows Desktop App (.exe)

Creates a real Windows installer — Store Control appears in the Start Menu like any installed program. No browser or terminal needed.

### What you need
- Node.js installed (same as above)
- Internet access during packaging to download Electron (~100 MB, first time only)
- ~500 MB free disk space

---

### Step 1 — Run the packaging script

1. Open `C:\StoreControl\artifacts\store-control\windows-setup\`
2. Double-click **`package-electron.bat`**
   — OR right-click **`package-electron.ps1`** → **Run with PowerShell**

The script will:
- Install all dependencies (including Windows-native build tools — fixed in this version)
- Install Electron (~100 MB download, first time only)
- Build the web app (Vite)
- Package as a Windows installer and portable EXE

Total time: 5–15 minutes first run, 2–3 minutes after that.

---

### Step 2 — Find the output

```
C:\StoreControl\artifacts\store-control\dist\electron\
```

| File | What it is |
|---|---|
| `Store Control Setup.exe` | Installer — adds to Start Menu, creates Desktop shortcut |
| `Store Control.exe` | Portable — runs without installing, copy it anywhere |

---

### Step 3 — Share with other PCs

Copy `Store Control Setup.exe` to any Windows PC. Run it once to install. Works fully offline after that.

**Moving data between PCs:** Settings → Export Backup (JSON) on the old PC → Import on the new one.

---

### What the desktop app gives you
- True **Windows application** — no browser or terminal needed
- Start Menu entry with the dark box icon
- Black title bar matching the app's dark theme
- Keyboard shortcuts: `F11` fullscreen, `Ctrl+R` reload, `Ctrl+Z/Y` undo/redo
- Works with **zero internet** after installation
- Clean uninstall via Windows Settings → Apps

---

## Troubleshooting

### Vercel — build fails

**Most common cause:** Root Directory is set to `artifacts/store-control` in the Vercel dashboard.

Fix: Vercel project → **Settings → General → Root Directory** → clear it → **Save** → Redeploy.

### Vercel — "Cannot find package" error

Make sure you pushed the latest code. In your GitHub repo, `vercel.json` must be visible at the **top level** (not inside any subfolder).

### Windows — packaging script closes immediately with no output

This was caused by missing Windows-native build tool binaries in the workspace config — **fixed in this version**. Pull the latest code and try again. If it still fails, run the script from Command Prompt to see the error:
```
cd C:\StoreControl\artifacts\store-control\windows-setup
start.bat
```

### Windows — "PORT environment variable is required" error

Use `dev:standalone`, not `dev`. The `start.bat` already uses the correct command — use that instead of running pnpm manually.

### Windows — "pnpm: command not found"

Run Command Prompt **as Administrator**:
```
npm install -g pnpm
```

### Windows — Port 3000 already in use

```
cd C:\StoreControl\artifacts\store-control
set PORT=3001
pnpm run dev:standalone
```
Then open `http://localhost:3001`.

### PWA — title bar is red / wrong color

Redeploy to Vercel after pushing the latest code — the theme color was updated to black (`#000000`) in this version.

### PWA — install icon not appearing

- Must be on **HTTPS** — Vercel provides this automatically.
- The install icon only appears after the service worker activates (usually on the second page load).
- In Chrome/Edge: look for a `+` or computer icon on the right side of the address bar.

### PWA — old red icon still showing after update

Browsers cache PWA icons aggressively. To force a refresh:
1. Uninstall the PWA (right-click its taskbar/Start Menu icon → Uninstall)
2. In Chrome: open `chrome://apps`, find Store Control, right-click → Remove
3. Revisit the URL and reinstall

### I lost all my data

Data lives in the browser's IndexedDB for the specific browser + device. Export backups regularly: **Settings → Export Backup (JSON)**. To move to another device: export → copy file → import.

---

## Quick Reference

| Action | How |
|---|---|
| **Start locally (easy)** | Double-click `windows-setup/start.bat` |
| **Start locally (manual)** | `pnpm run dev:standalone` from `artifacts/store-control/` |
| **Build for Vercel** | `pnpm run build:standalone` |
| **Package Windows .exe** | Double-click `windows-setup/package-electron.bat` |
| **EXE output folder** | `artifacts/store-control/dist/electron/` |
| **Default login** | `admin` / `admin123` |
| **Local URL** | http://localhost:3000 |
| **Install as PWA (desktop)** | Visit URL in Chrome/Edge → install icon in address bar |
| **Install as PWA (mobile)** | Visit URL → Share → Add to Home Screen |
| **Vercel Root Directory setting** | *(leave blank — never set this)* |
| **App icon style** | Dark navy box/cube on black title bar |
