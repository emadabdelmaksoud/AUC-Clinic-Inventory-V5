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

-- ── 6. Default Asset Types & Categories (seed data) ──────────
-- Run this AFTER the tables are created.
-- Uses ON CONFLICT DO NOTHING so it is safe to re-run.

INSERT INTO asset_types ("id", "name") VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Medical Equipment'),
  ('a0000000-0000-0000-0000-000000000002', 'IT Equipment'),
  ('a0000000-0000-0000-0000-000000000003', 'Furniture'),
  ('a0000000-0000-0000-0000-000000000004', 'Office Equipment'),
  ('a0000000-0000-0000-0000-000000000005', 'Vehicle'),
  ('a0000000-0000-0000-0000-000000000006', 'Other')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO asset_categories ("id", "assetTypeId", "name") VALUES
  -- Medical Equipment
  ('c0000001-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Diagnostic Equipment'),
  ('c0000001-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Patient Monitoring'),
  ('c0000001-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Surgical Tools'),
  ('c0000001-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Laboratory Equipment'),
  ('c0000001-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Rehabilitation Equipment'),
  -- IT Equipment
  ('c0000002-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Laptop'),
  ('c0000002-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Desktop Computer'),
  ('c0000002-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Printer'),
  ('c0000002-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'Scanner'),
  ('c0000002-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 'Network Equipment'),
  ('c0000002-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000002', 'Server'),
  -- Furniture
  ('c0000003-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Desk'),
  ('c0000003-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'Chair'),
  ('c0000003-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'Cabinet'),
  ('c0000003-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'Shelving'),
  ('c0000003-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', 'Examination Table'),
  -- Office Equipment
  ('c0000004-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'Photocopier'),
  ('c0000004-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'Projector'),
  ('c0000004-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'Whiteboard'),
  ('c0000004-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', 'Telephone System'),
  -- Vehicle
  ('c0000005-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'Ambulance'),
  ('c0000005-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'Staff Vehicle'),
  ('c0000005-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'Delivery Vehicle')
ON CONFLICT ("id") DO NOTHING;

-- ── 7. Verification ──────────────────────────────────────────

-- Run these to confirm the tables were created correctly:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('asset_types','asset_categories','assets');
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'assets' ORDER BY ordinal_position;
-- SELECT * FROM asset_types ORDER BY name;
-- SELECT c.name, t.name as type FROM asset_categories c JOIN asset_types t ON t.id = c."assetTypeId" ORDER BY t.name, c.name;
