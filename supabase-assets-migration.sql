-- ============================================================
-- AUC Clinic Inventory — Assets & Equipment
-- Run this in your Supabase SQL Editor (Project > SQL Editor)
-- These are NEW tables only — do not re-run existing table DDL
-- ============================================================

-- IMPORTANT: Column names use camelCase to match the TypeScript
-- interface properties, consistent with your existing tables.
-- If your existing tables (users, products, etc.) use snake_case
-- column names instead, replace camelCase with snake_case below
-- and update the TypeScript interfaces in src/lib/db.ts to match.

-- ── 1. Asset Types ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asset_types (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Asset Categories ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS asset_categories (
  "id"          TEXT PRIMARY KEY,
  "assetTypeId" TEXT NOT NULL REFERENCES asset_types("id") ON DELETE RESTRICT,
  "name"        TEXT NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Assets ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assets (
  "id"               TEXT PRIMARY KEY,
  "assetName"        TEXT NOT NULL,
  "assetTypeId"      TEXT NOT NULL REFERENCES asset_types("id") ON DELETE RESTRICT,
  "assetCategoryId"  TEXT REFERENCES asset_categories("id") ON DELETE SET NULL,
  "fyNumber"         TEXT,
  "faNumber"         TEXT,
  "ccNumber"         TEXT,
  "serialNumber"     TEXT,
  "quantity"         INTEGER NOT NULL DEFAULT 1,
  "status"           TEXT NOT NULL DEFAULT 'active'
                     CHECK ("status" IN ('active','in_storage','under_maintenance','lost','disposed')),
  "custodianType"    TEXT
                     CHECK ("custodianType" IN ('system_user','external_staff') OR "custodianType" IS NULL),
  "custodianUserId"  TEXT,   -- references users("id"), soft link
  "custodianName"    TEXT,
  "custodianPhone"   TEXT,
  "custodianIdNumber" TEXT,
  "custodianEmail"   TEXT,
  "custodianAssignmentDate" DATE,
  "custodianNotes"   TEXT,
  "notes"            TEXT,
  "createdBy"        TEXT,   -- references users("id"), soft link
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Performance Indexes ───────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_asset_categories_type
  ON asset_categories ("assetTypeId");

CREATE INDEX IF NOT EXISTS idx_assets_type
  ON assets ("assetTypeId");

CREATE INDEX IF NOT EXISTS idx_assets_category
  ON assets ("assetCategoryId");

CREATE INDEX IF NOT EXISTS idx_assets_status
  ON assets ("status");

CREATE INDEX IF NOT EXISTS idx_assets_custodian_user
  ON assets ("custodianUserId");

CREATE INDEX IF NOT EXISTS idx_assets_created_at
  ON assets ("createdAt");

-- ── 5. Row Level Security (RLS) ──────────────────────────────
-- The app uses a custom auth system (not Supabase Auth).
-- If your app authenticates via Supabase JWT, enable RLS below.
-- Otherwise, leave RLS disabled and rely on the app's role-based
-- access control (only administrators can access these tables).

-- ALTER TABLE asset_types      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE asset_categories ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE assets           ENABLE ROW LEVEL SECURITY;

-- Allow full access to authenticated Supabase users (if using Supabase Auth):
-- CREATE POLICY "authenticated_full" ON asset_types      FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY "authenticated_full" ON asset_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY "authenticated_full" ON assets           FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 6. Verification ──────────────────────────────────────────

-- Run these to confirm the tables were created correctly:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('asset_types','asset_categories','assets');
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'assets' ORDER BY ordinal_position;
