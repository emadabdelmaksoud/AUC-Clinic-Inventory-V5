---
name: Asset module architecture
description: Key decisions for the Assets & Equipment module — history log, location, import.
---

# Asset Module

**Stack:** React + Vite + Dexie (IndexedDB) v4. Optional Supabase via db-supabase-adapter.ts.

## Dexie versioning rule
Each time a new indexed field or table is added, bump the Dexie version in StoreControlDB constructor. Current version: **4** (added warehouseId/sectionId indexes on assets, and assetTransactions table).

**Why:** Dexie won't create indexes for new fields unless the schema is versioned up.

**How to apply:** Next schema change → add `this.version(N+1).stores({...})` block. Only include stores that change.

## Asset Transaction History
`db.assetTransactions` logs every create/update/delete/import on assets.
- `logAssetTransaction()` is internal (non-exported) in assets.ts — it's best-effort (wrapped in try/catch so it never blocks the main operation).
- `listAssetTransactions(assetId)` is exported for the UI history tab.
- The action types are: created | updated | deleted | custody_transferred | location_changed | status_changed | imported.
- updateAsset auto-detects what changed (custodian/status/location) and sets the action type accordingly.

## Location Fields
`warehouseId` and `sectionId` on Asset reference the existing warehouses/warehouse_sections tables via soft links (no FK constraints in Dexie, soft FK in Supabase SQL).
- AssetDetail component fetches warehouse/section names via separate queries.
- AssetForm clears sectionId when warehouseId changes.

## Excel Import
`importAssetsFromExcel(file, userId, userName?)` in assets.ts:
- Matches Asset Type by name (case-insensitive). Skips row if type not found.
- Matches Category by `typeId::categoryName`. Matches Warehouse/Section by name.
- Expected column headers: Asset Name, Asset Type, Category, FY Number, FA Number, CC Number, Serial Number, Quantity, Status, Custodian Name/Phone/ID/Email/Notes, Asset Notes, Warehouse, Section.
- `downloadImportTemplate()` generates a prefilled template xlsx.

## Supabase SQL
`supabase-assets-migration.sql` at project root contains the full DDL including the new `asset_transactions` table and the ALTER TABLE upgrade path for existing deployments.
