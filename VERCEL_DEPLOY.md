# Vercel Deployment Guide — AUC Clinic Inventory

## Prerequisites
- A [Vercel account](https://vercel.com) (free tier is enough)
- Your project pushed to GitHub / GitLab / Bitbucket

---

## Step 1 — Import the repository

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository** and select this repo
3. Vercel auto-detects the framework — **ignore** its suggestion (we override it)

---

## Step 2 — Configure the project

In the **Configure Project** screen set the following. Leave everything else at its default:

| Setting | Value |
|---|---|
| **Framework Preset** | Other |
| **Root Directory** | ` ` *(leave blank — use repo root)* |
| **Build Command** | `pnpm --filter @workspace/store-control run build` |
| **Output Directory** | `artifacts/store-control/dist` |
| **Install Command** | `pnpm install` |

> These values are already saved in `vercel.json` at the repo root, so Vercel will pick them up automatically once you import.

---

## Step 3 — Environment variables (optional)

The app stores all data in the browser (IndexedDB). No server-side env vars are required for a basic deployment.

If you switch to **Supabase** mode, add these two variables in Vercel → Settings → Environment Variables:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

---

## Step 4 — Deploy

Click **Deploy**. Vercel will:

1. Run `pnpm install` (installs all workspace dependencies)
2. Run `pnpm --filter @workspace/store-control run build` (Vite build)
3. Serve the output from `artifacts/store-control/dist`
4. Apply the SPA rewrite rule (`/* → /index.html`) so client-side routing works

A green **Congratulations** screen means it worked. Your app is live at `https://<project>.vercel.app`.

---

## Troubleshooting

| Error | Fix |
|---|---|
| `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` | Make sure `pnpm-workspace.yaml` is at the repo root (it already is) |
| Build exits with code 1 (PWA chunk size) | Already fixed — `maximumFileSizeToCacheInBytes` is set to 4 MiB in `vite.config.ts` |
| 404 on page refresh | The `vercel.json` rewrite rule handles this automatically |
| Blank screen after deploy | Check browser console — usually a missing env var or a base-path mismatch |

---

## Re-deploying

Every `git push` to your main branch triggers an automatic re-deploy on Vercel. No extra steps needed.
