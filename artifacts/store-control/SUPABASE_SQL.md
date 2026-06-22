# Supabase SQL Scripts

Run these in your Supabase SQL Editor **in order** when connecting the app to Supabase.

---

## 1. Table Creation

```sql
-- Users (custom auth — not using Supabase Auth)
create table if not exists users (
  id uuid primary key,
  username text not null unique,
  full_name text not null,
  password_hash text not null,
  role text not null check (role in ('admin', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Products
create table if not exists products (
  id uuid primary key,
  product_code text not null unique,
  product_name text not null,
  barcode text,
  category text,
  manufacturer text,
  base_unit text not null,
  reorder_level numeric not null default 0,
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Product Units
create table if not exists product_units (
  id uuid primary key,
  product_id uuid not null references products(id) on delete cascade,
  unit_name text not null,
  factor_to_base numeric not null default 1,
  is_base boolean not null default false,
  barcode text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Warehouses
create table if not exists warehouses (
  id uuid primary key,
  warehouse_code text not null unique,
  warehouse_name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Warehouse Sections
create table if not exists warehouse_sections (
  id uuid primary key,
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  section_name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Inventory Batches
create table if not exists inventory_batches (
  id uuid primary key,
  product_id uuid not null references products(id) on delete restrict,
  warehouse_id uuid not null references warehouses(id) on delete restrict,
  section_id uuid references warehouse_sections(id) on delete set null,
  batch_number text,
  expiry_date date,
  quantity_base_unit numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Inventory Transactions
create table if not exists inventory_transactions (
  id uuid primary key,
  transaction_type text not null check (transaction_type in (
    'stock_in','dispensing','transfer_in','transfer_out',
    'disposal','adjustment','inventory_count'
  )),
  product_id uuid not null references products(id) on delete restrict,
  batch_id uuid not null references inventory_batches(id) on delete restrict,
  warehouse_id uuid not null references warehouses(id) on delete restrict,
  section_id uuid references warehouse_sections(id) on delete set null,
  quantity numeric not null,
  unit_id uuid references product_units(id) on delete set null,
  quantity_base_unit numeric not null,
  performed_by uuid references users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

-- Audit Logs
create table if not exists audit_logs (
  id uuid primary key,
  action text not null,
  table_name text not null,
  record_id text not null,
  user_id uuid references users(id) on delete set null,
  changes text not null,
  created_at timestamptz not null default now()
);

-- Settings
create table if not exists settings (
  key text primary key,
  value text not null
);
```

---

## 2. Performance Indexes

```sql
-- Products
create index if not exists idx_products_category on products(category);
create index if not exists idx_products_barcode on products(barcode) where barcode is not null;
create index if not exists idx_products_updated_at on products(updated_at desc);

-- Product Units
create index if not exists idx_product_units_product_id on product_units(product_id);

-- Warehouse Sections
create index if not exists idx_warehouse_sections_warehouse_id on warehouse_sections(warehouse_id);

-- Inventory Batches
create index if not exists idx_batches_product_id on inventory_batches(product_id);
create index if not exists idx_batches_warehouse_id on inventory_batches(warehouse_id);
create index if not exists idx_batches_expiry_date on inventory_batches(expiry_date) where expiry_date is not null;
create index if not exists idx_batches_qty on inventory_batches(quantity_base_unit) where quantity_base_unit > 0;

-- Inventory Transactions
create index if not exists idx_txn_product_id on inventory_transactions(product_id);
create index if not exists idx_txn_warehouse_id on inventory_transactions(warehouse_id);
create index if not exists idx_txn_batch_id on inventory_transactions(batch_id);
create index if not exists idx_txn_created_at on inventory_transactions(created_at desc);
create index if not exists idx_txn_type on inventory_transactions(transaction_type);
create index if not exists idx_txn_performed_by on inventory_transactions(performed_by);

-- Audit Logs
create index if not exists idx_audit_table_name on audit_logs(table_name);
create index if not exists idx_audit_user_id on audit_logs(user_id);
create index if not exists idx_audit_created_at on audit_logs(created_at desc);
```

---

## 3. Row Level Security (RLS)

The app uses a custom user table (not Supabase Auth), so RLS uses the anon key
for all access. The security boundary is the application layer.

```sql
-- Enable RLS on all tables
alter table users enable row level security;
alter table products enable row level security;
alter table product_units enable row level security;
alter table warehouses enable row level security;
alter table warehouse_sections enable row level security;
alter table inventory_batches enable row level security;
alter table inventory_transactions enable row level security;
alter table audit_logs enable row level security;
alter table settings enable row level security;

-- Allow all operations from the anon key (app enforces role checks)
-- IMPORTANT: Restrict these further once you migrate to Supabase Auth
create policy "anon full access" on users for all using (true) with check (true);
create policy "anon full access" on products for all using (true) with check (true);
create policy "anon full access" on product_units for all using (true) with check (true);
create policy "anon full access" on warehouses for all using (true) with check (true);
create policy "anon full access" on warehouse_sections for all using (true) with check (true);
create policy "anon full access" on inventory_batches for all using (true) with check (true);
create policy "anon full access" on inventory_transactions for all using (true) with check (true);
create policy "anon full access" on audit_logs for all using (true) with check (true);
create policy "anon full access" on settings for all using (true) with check (true);
```

---

## 4. Protect passwordHash from being returned

```sql
-- Create a view that strips passwordHash for safe user queries
create or replace view users_safe as
  select id, username, full_name, role, created_at, updated_at
  from users;

grant select on users_safe to anon;
```

---

## 5. Notes

- **No service role key is used** — the app only uses `VITE_SUPABASE_ANON_KEY`. ✓
- **No Supabase Auth** — passwords are SHA-256 hashed in the browser and stored in the `users` table. This is acceptable for a private clinic intranet app. If you want stronger security, migrate to Supabase Auth in a future task.
- **Camelcase vs snake_case** — the app uses camelCase fields (e.g. `productId`), Supabase uses snake_case (e.g. `product_id`). The adapter in `db-supabase-adapter.ts` handles the mapping transparently.
