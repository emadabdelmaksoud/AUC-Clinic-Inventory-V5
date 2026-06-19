# Store Control

A fully offline clinic/store inventory management system that runs entirely in your browser using IndexedDB — no internet, no backend, no Supabase required.

## Run & Operate

- `pnpm --filter @workspace/store-control run dev` — run the app (port 25373)
- Default admin login: **admin / admin123** (auto-created on first launch)

## Stack

- React + Vite (SPA)
- Dexie.js (IndexedDB — all data stored locally in browser)
- Wouter (routing)
- TanStack Query
- shadcn/ui + Tailwind CSS
- react-hook-form + Zod validation
- xlsx (Excel import/export)
- recharts (charts in reports)
- sonner (toast notifications)
- date-fns

## Where things live

- `artifacts/store-control/src/lib/db.ts` — Dexie DB schema (source of truth for all data models)
- `artifacts/store-control/src/lib/auth.tsx` — AuthProvider, login, user management, SHA-256 password hashing
- `artifacts/store-control/src/lib/permissions.ts` — Role matrix (admin vs staff)
- `artifacts/store-control/src/lib/products.ts` — Product CRUD
- `artifacts/store-control/src/lib/product-units.ts` — Unit-of-measure logic, conversion helpers
- `artifacts/store-control/src/lib/warehouses.ts` — Warehouse & section CRUD
- `artifacts/store-control/src/lib/inventory.ts` — Transaction recording, batch management
- `artifacts/store-control/src/lib/fifo.ts` — FIFO dispensing logic, expiry classification
- `artifacts/store-control/src/lib/reports.ts` — Report queries, stock summary, KPIs
- `artifacts/store-control/src/lib/audit.ts` — Audit log writes and reads
- `artifacts/store-control/src/lib/backup.ts` — JSON backup export/import, Excel export, Excel product import

## Architecture decisions

- **No backend** — all data in IndexedDB via Dexie.js; zero network requests
- **SHA-256 password hashing** via Web Crypto API (built into all modern browsers)
- **Session** stored in localStorage as `{id}` only; loaded and re-validated from DB on init
- **FIFO dispensing** — batches sorted by expiry date first, then creation date; expired batches blocked from dispensing
- **Transactions are append-only** — quantities are derived from summing batch `quantityBaseUnit`; no in-place edits to transactions

## Product

- **Products** — catalog with barcode, category, manufacturer, base unit, reorder level; multi-unit-of-measure per product
- **Inventory** — record stock-in, dispensing, transfer, disposal, adjustment, inventory count transactions
- **Warehouses** — multiple warehouses each with sections; stock shown per warehouse
- **Reports** — stock summary with expiry/low-stock alerts, full transaction history with filters, bar chart
- **FIFO dispensing** — automatically deducts from oldest non-expired batches
- **Import/Export** — Excel product import, Excel inventory export, JSON backup/restore
- **Barcodes** — visual barcode generation from product/unit barcodes, print support
- **Users** — admin can create staff/admin users, change passwords, delete users
- **Audit logs** — every create/update/delete/transaction is logged
- **Settings** — org name, near-expiry threshold, dark mode toggle

## User preferences

_Populate as preferences are expressed._

## Gotchas

- Must run `pnpm --filter @workspace/store-control run dev` to start; don't use root-level `pnpm dev`
- Clearing browser storage wipes all data — export JSON backups regularly
- The `@workspace/api-client-react` dep was removed from package.json (was in scaffold but not needed)
