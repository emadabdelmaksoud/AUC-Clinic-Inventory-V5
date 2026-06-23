---
name: AUC Clinic Inventory — Architecture Notes
description: Durable decisions and quirks for the AUC Clinic Inventory pnpm monorepo app
---

## Build Output
- Vite outDir is `dist/public` (not `dist`) — matches artifact.toml publicDir
- `prebuild` script cleans `dist/` before each build (prevents stale top-level files)
- `vercel.json` at workspace root; outputDirectory = "artifacts/store-control/dist/public"
- Cannot edit artifact.toml via verifyAndReplaceArtifactToml (DUPLICATE_PREVIEW_PATH error from migration-backup copy)

**Why:** artifact.toml expects dist/public; old outDir was dist, causing blank Vercel pages.

## Roles (3-tier)
- `administrator` = Super Admin (protected, cannot be deleted or have password changed by Admin)
- `admin` = full inventory management but cannot touch administrator accounts
- `staff` = operational only
- `canManageUser(actorRole, targetRole)` in permissions.ts controls cross-role actions
- `ensureDefaultAdmin()` auto-upgrades the bootstrapped "admin" user (username="admin") to "administrator" on first run

**Why:** Client needed super-admin protection from regular admins.

## Restore Points
- Stored in separate Dexie DB "StoreControlRestorePoints" (never in Supabase)
- Even in Supabase mode, restorePoints are local-only
- lib/restore-points.ts has save/list/delete/restore functions

## Auto-Logout
- hooks/use-inactivity-logout.ts; reads "autoLogoutMinutes" from localStorage
- Wired in AppRouter (needs useAuth context); signOut passed as arg
- Resets timer on mouse/keyboard/touch/scroll/click

## Pre-existing TypeScript errors (not to fix unless asked)
- AppLayout.tsx: db.purchaseRequests not on type
- Reports.tsx: not all code paths return
- StaffReport.tsx: "read" action not in Action type
