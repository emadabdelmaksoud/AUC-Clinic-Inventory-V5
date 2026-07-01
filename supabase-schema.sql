-- ============================================================
--  AUC Clinic Inventory — Supabase Schema
--  Run this entire script in the Supabase SQL Editor once.
--  Tables use camelCase column names to match the app's
--  TypeScript interfaces exactly (no column mapping needed).
-- ============================================================

-- ── USERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  username        TEXT UNIQUE NOT NULL,
  "fullName"      TEXT NOT NULL DEFAULT '',
  "passwordHash"  TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL DEFAULT 'staff',
  status          TEXT NOT NULL DEFAULT 'active',
  "employeeId"    TEXT,
  email           TEXT,
  department      TEXT,
  position        TEXT,
  phone           TEXT,
  "photoUrl"      TEXT,
  "lastLogin"     TEXT,
  "createdAt"     TEXT NOT NULL,
  "updatedAt"     TEXT NOT NULL
);

-- ── PRODUCTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  "productCode"   TEXT NOT NULL DEFAULT '',
  "productName"   TEXT NOT NULL,
  barcode         TEXT,
  category        TEXT,
  manufacturer    TEXT,
  "baseUnit"      TEXT NOT NULL DEFAULT 'pcs',
  "reorderLevel"  INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  "createdBy"     TEXT,
  "createdAt"     TEXT NOT NULL,
  "updatedAt"     TEXT NOT NULL
);

-- ── PRODUCT UNITS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_units (
  id              TEXT PRIMARY KEY,
  "productId"     TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  "unitName"      TEXT NOT NULL,
  "factorToBase"  NUMERIC NOT NULL DEFAULT 1,
  "isBase"        BOOLEAN NOT NULL DEFAULT FALSE,
  barcode         TEXT,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TEXT NOT NULL,
  "updatedAt"     TEXT NOT NULL
);

-- ── WAREHOUSES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouses (
  id                TEXT PRIMARY KEY,
  "warehouseCode"   TEXT UNIQUE NOT NULL,
  "warehouseName"   TEXT NOT NULL,
  description       TEXT,
  "isActive"        BOOLEAN NOT NULL DEFAULT TRUE,
  "createdBy"       TEXT,
  "createdAt"       TEXT NOT NULL,
  "updatedAt"       TEXT NOT NULL
);

-- ── WAREHOUSE SECTIONS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouse_sections (
  id              TEXT PRIMARY KEY,
  "warehouseId"   TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  "sectionName"   TEXT NOT NULL,
  description     TEXT,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"     TEXT NOT NULL,
  "updatedAt"     TEXT NOT NULL
);

-- ── INVENTORY BATCHES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_batches (
  id                    TEXT PRIMARY KEY,
  "productId"           TEXT NOT NULL REFERENCES products(id),
  "warehouseId"         TEXT NOT NULL REFERENCES warehouses(id),
  "sectionId"           TEXT,
  "batchNumber"         TEXT,
  "expiryDate"          TEXT,
  "quantityBaseUnit"    NUMERIC NOT NULL DEFAULT 0,
  "createdAt"           TEXT NOT NULL,
  "updatedAt"           TEXT NOT NULL
);

-- ── INVENTORY TRANSACTIONS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id                  TEXT PRIMARY KEY,
  "transactionType"   TEXT NOT NULL,
  "productId"         TEXT NOT NULL,
  "batchId"           TEXT NOT NULL,
  "warehouseId"       TEXT NOT NULL,
  "sectionId"         TEXT,
  quantity            NUMERIC NOT NULL,
  "unitId"            TEXT NOT NULL,
  "quantityBaseUnit"  NUMERIC NOT NULL,
  "performedBy"       TEXT,
  notes               TEXT,
  "createdAt"         TEXT NOT NULL
);

-- ── AUDIT LOGS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  action      TEXT NOT NULL,
  "tableName" TEXT NOT NULL,
  "recordId"  TEXT NOT NULL,
  "userId"    TEXT,
  changes     TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL
);

-- ── SETTINGS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- ── ASSET TYPES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_types (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

-- ── ASSET CATEGORIES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_categories (
  id            TEXT PRIMARY KEY,
  "assetTypeId" TEXT NOT NULL REFERENCES asset_types(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  "createdAt"   TEXT NOT NULL,
  "updatedAt"   TEXT NOT NULL
);

-- ── ASSETS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets (
  id                        TEXT PRIMARY KEY,
  "assetName"               TEXT NOT NULL,
  "assetTypeId"             TEXT NOT NULL REFERENCES asset_types(id),
  "assetCategoryId"         TEXT,
  "fyNumber"                TEXT,
  "faNumber"                TEXT,
  "ccNumber"                TEXT,
  "serialNumber"            TEXT,
  quantity                  INTEGER NOT NULL DEFAULT 1,
  status                    TEXT NOT NULL DEFAULT 'active',
  "custodianType"           TEXT,
  "custodianUserId"         TEXT,
  "custodianName"           TEXT,
  "custodianPhone"          TEXT,
  "custodianIdNumber"       TEXT,
  "custodianEmail"          TEXT,
  "custodianAssignmentDate" TEXT,
  "custodianNotes"          TEXT,
  notes                     TEXT,
  "warehouseId"             TEXT,
  "sectionId"               TEXT,
  "createdBy"               TEXT,
  "createdAt"               TEXT NOT NULL,
  "updatedAt"               TEXT NOT NULL
);

-- ── ASSET TRANSACTIONS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_transactions (
  id                TEXT PRIMARY KEY,
  "assetId"         TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  action            TEXT NOT NULL,
  summary           TEXT NOT NULL DEFAULT '',
  "performedBy"     TEXT,
  "performedByName" TEXT,
  "createdAt"       TEXT NOT NULL
);

-- ── EXTERNAL STAFF ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS external_staff (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  "idNumber"  TEXT,
  department  TEXT,
  notes       TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

-- ============================================================
--  ROW-LEVEL SECURITY
--  The app uses the anon key, so we allow all operations.
--  Tighten these policies before going to production if needed.
-- ============================================================

ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_units       ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_sections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_batches   ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_types         ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_staff      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON users               FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON products            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON product_units       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON warehouses          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON warehouse_sections  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON inventory_batches   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON inventory_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON audit_logs          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON settings            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON asset_types         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON asset_categories    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON assets              FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON asset_transactions  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON external_staff      FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
--  DEFAULT ASSET TYPES & CATEGORIES
--  Insert these once after table creation.
-- ============================================================

INSERT INTO asset_types (id, name, "createdAt", "updatedAt") VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Medical Equipment', NOW()::TEXT, NOW()::TEXT),
  ('a0000000-0000-0000-0000-000000000002', 'IT Equipment',       NOW()::TEXT, NOW()::TEXT),
  ('a0000000-0000-0000-0000-000000000003', 'Furniture',          NOW()::TEXT, NOW()::TEXT),
  ('a0000000-0000-0000-0000-000000000004', 'Office Equipment',   NOW()::TEXT, NOW()::TEXT),
  ('a0000000-0000-0000-0000-000000000005', 'Vehicle',            NOW()::TEXT, NOW()::TEXT),
  ('a0000000-0000-0000-0000-000000000006', 'Other',              NOW()::TEXT, NOW()::TEXT)
ON CONFLICT (id) DO NOTHING;

INSERT INTO asset_categories (id, "assetTypeId", name, "createdAt", "updatedAt") VALUES
  -- Medical Equipment
  ('c0000001-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Diagnostic Equipment',    NOW()::TEXT, NOW()::TEXT),
  ('c0000001-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Patient Monitoring',       NOW()::TEXT, NOW()::TEXT),
  ('c0000001-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Surgical Tools',           NOW()::TEXT, NOW()::TEXT),
  ('c0000001-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Laboratory Equipment',     NOW()::TEXT, NOW()::TEXT),
  ('c0000001-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Rehabilitation Equipment', NOW()::TEXT, NOW()::TEXT),
  -- IT Equipment
  ('c0000002-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Laptop',            NOW()::TEXT, NOW()::TEXT),
  ('c0000002-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Desktop Computer',  NOW()::TEXT, NOW()::TEXT),
  ('c0000002-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Printer',           NOW()::TEXT, NOW()::TEXT),
  ('c0000002-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'Scanner',           NOW()::TEXT, NOW()::TEXT),
  ('c0000002-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 'Network Equipment', NOW()::TEXT, NOW()::TEXT),
  ('c0000002-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000002', 'Server',            NOW()::TEXT, NOW()::TEXT),
  -- Furniture
  ('c0000003-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Desk',              NOW()::TEXT, NOW()::TEXT),
  ('c0000003-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'Chair',             NOW()::TEXT, NOW()::TEXT),
  ('c0000003-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'Cabinet',           NOW()::TEXT, NOW()::TEXT),
  ('c0000003-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'Shelving',          NOW()::TEXT, NOW()::TEXT),
  ('c0000003-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', 'Examination Table', NOW()::TEXT, NOW()::TEXT),
  -- Office Equipment
  ('c0000004-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'Photocopier',       NOW()::TEXT, NOW()::TEXT),
  ('c0000004-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'Projector',         NOW()::TEXT, NOW()::TEXT),
  ('c0000004-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'Whiteboard',        NOW()::TEXT, NOW()::TEXT),
  ('c0000004-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', 'Telephone System',  NOW()::TEXT, NOW()::TEXT),
  -- Vehicle
  ('c0000005-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'Ambulance',         NOW()::TEXT, NOW()::TEXT),
  ('c0000005-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'Staff Vehicle',     NOW()::TEXT, NOW()::TEXT),
  ('c0000005-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'Delivery Vehicle',  NOW()::TEXT, NOW()::TEXT)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
--  ENVIRONMENT VARIABLES NEEDED IN VERCEL / REPLIT
-- ============================================================
--  VITE_SUPABASE_URL      = https://<your-project-id>.supabase.co
--  VITE_SUPABASE_ANON_KEY = eyJ...  (anon/public key from Supabase API settings)
--
--  Once set, the app auto-detects Supabase and uses it instead of IndexedDB.
-- ============================================================
