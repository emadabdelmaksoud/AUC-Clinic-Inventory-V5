import Dexie, { type Table } from "dexie";
import { isSupabaseConfigured, getSupabaseClient } from "./supabase";
import { SupabaseTableAdapter } from "./db-supabase-adapter";

export interface User {
  id: string;
  username: string;
  fullName: string;
  passwordHash: string;
  role: "administrator" | "admin" | "staff";
  status?: "active" | "inactive";
  employeeId?: string;
  email?: string;
  department?: string;
  position?: string;
  phone?: string;
  photoUrl?: string;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  productCode: string;
  productName: string;
  barcode: string | null;
  category: string | null;
  manufacturer: string | null;
  baseUnit: string;
  reorderLevel: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductUnit {
  id: string;
  productId: string;
  unitName: string;
  factorToBase: number;
  isBase: boolean;
  barcode: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Warehouse {
  id: string;
  warehouseCode: string;
  warehouseName: string;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseSection {
  id: string;
  warehouseId: string;
  sectionName: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TransactionType =
  | "stock_in"
  | "dispensing"
  | "transfer_in"
  | "transfer_out"
  | "disposal"
  | "adjustment"
  | "inventory_count";

export interface InventoryBatch {
  id: string;
  productId: string;
  warehouseId: string;
  sectionId: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  quantityBaseUnit: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryTransaction {
  id: string;
  transactionType: TransactionType;
  productId: string;
  batchId: string;
  warehouseId: string;
  sectionId: string | null;
  quantity: number;
  unitId: string;
  quantityBaseUnit: number;
  performedBy: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  tableName: string;
  recordId: string;
  userId: string | null;
  changes: string;
  createdAt: string;
}

export interface AppSetting {
  key: string;
  value: string;
}

// ── Assets & Equipment ────────────────────────────────────────────────────────

export interface AssetType {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetCategory {
  id: string;
  assetTypeId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type AssetStatus =
  | "active"
  | "in_storage"
  | "under_maintenance"
  | "lost"
  | "disposed";

export type CustodianType = "system_user" | "external_staff";

export interface Asset {
  id: string;
  assetName: string;
  assetTypeId: string;
  assetCategoryId: string | null;
  fyNumber: string | null;
  faNumber: string | null;
  ccNumber: string | null;
  serialNumber: string | null;
  quantity: number;
  status: AssetStatus;
  custodianType: CustodianType | null;
  custodianUserId: string | null;
  custodianName: string | null;
  custodianPhone: string | null;
  custodianIdNumber: string | null;
  custodianEmail: string | null;
  custodianAssignmentDate: string | null;
  custodianNotes: string | null;
  notes: string | null;
  warehouseId: string | null;
  sectionId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetTransaction {
  id: string;
  assetId: string;
  action: "created" | "updated" | "deleted" | "custody_transferred" | "location_changed" | "status_changed" | "imported";
  summary: string;
  performedBy: string | null;
  performedByName: string | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export class StoreControlDB extends Dexie {
  users!: Table<User, string>;
  products!: Table<Product, string>;
  productUnits!: Table<ProductUnit, string>;
  warehouses!: Table<Warehouse, string>;
  warehouseSections!: Table<WarehouseSection, string>;
  inventoryBatches!: Table<InventoryBatch, string>;
  inventoryTransactions!: Table<InventoryTransaction, string>;
  auditLogs!: Table<AuditLog, string>;
  settings!: Table<AppSetting, string>;
  assetTypes!: Table<AssetType, string>;
  assetCategories!: Table<AssetCategory, string>;
  assets!: Table<Asset, string>;
  assetTransactions!: Table<AssetTransaction, string>;

  constructor() {
    super("StoreControlDB");
    this.version(1).stores({
      users: "id, username, role",
      products: "id, productCode, productName, barcode, category, manufacturer",
      productUnits: "id, productId, unitName, barcode",
      warehouses: "id, warehouseCode, warehouseName, isActive",
      warehouseSections: "id, warehouseId, sectionName",
      inventoryBatches: "id, productId, warehouseId, sectionId, expiryDate",
      inventoryTransactions:
        "id, transactionType, productId, batchId, warehouseId, createdAt",
      auditLogs: "id, tableName, userId, createdAt",
      settings: "key",
    });
    this.version(2).stores({
      assetTypes: "id, name",
      assetCategories: "id, assetTypeId, name",
      assets: "id, assetTypeId, assetCategoryId, status, custodianUserId, createdAt",
    });
    // v3: seed default asset types & categories during DB open (runs once per browser)
    this.version(3).upgrade(tx => {
      return tx.table("assetTypes").count().then((n: number) => {
        if (n > 0) return;
        const now = new Date().toISOString();
        const TYPES = [
          { id: "a0000000-0000-0000-0000-000000000001", name: "Medical Equipment", createdAt: now, updatedAt: now },
          { id: "a0000000-0000-0000-0000-000000000002", name: "IT Equipment",       createdAt: now, updatedAt: now },
          { id: "a0000000-0000-0000-0000-000000000003", name: "Furniture",          createdAt: now, updatedAt: now },
          { id: "a0000000-0000-0000-0000-000000000004", name: "Office Equipment",   createdAt: now, updatedAt: now },
          { id: "a0000000-0000-0000-0000-000000000005", name: "Vehicle",            createdAt: now, updatedAt: now },
          { id: "a0000000-0000-0000-0000-000000000006", name: "Other",              createdAt: now, updatedAt: now },
        ];
        const CATS = [
          // Medical Equipment
          { id: "c0000001-0000-0000-0000-000000000001", assetTypeId: "a0000000-0000-0000-0000-000000000001", name: "Diagnostic Equipment",    createdAt: now, updatedAt: now },
          { id: "c0000001-0000-0000-0000-000000000002", assetTypeId: "a0000000-0000-0000-0000-000000000001", name: "Patient Monitoring",       createdAt: now, updatedAt: now },
          { id: "c0000001-0000-0000-0000-000000000003", assetTypeId: "a0000000-0000-0000-0000-000000000001", name: "Surgical Tools",           createdAt: now, updatedAt: now },
          { id: "c0000001-0000-0000-0000-000000000004", assetTypeId: "a0000000-0000-0000-0000-000000000001", name: "Laboratory Equipment",     createdAt: now, updatedAt: now },
          { id: "c0000001-0000-0000-0000-000000000005", assetTypeId: "a0000000-0000-0000-0000-000000000001", name: "Rehabilitation Equipment", createdAt: now, updatedAt: now },
          // IT Equipment
          { id: "c0000002-0000-0000-0000-000000000001", assetTypeId: "a0000000-0000-0000-0000-000000000002", name: "Laptop",            createdAt: now, updatedAt: now },
          { id: "c0000002-0000-0000-0000-000000000002", assetTypeId: "a0000000-0000-0000-0000-000000000002", name: "Desktop Computer",  createdAt: now, updatedAt: now },
          { id: "c0000002-0000-0000-0000-000000000003", assetTypeId: "a0000000-0000-0000-0000-000000000002", name: "Printer",           createdAt: now, updatedAt: now },
          { id: "c0000002-0000-0000-0000-000000000004", assetTypeId: "a0000000-0000-0000-0000-000000000002", name: "Scanner",           createdAt: now, updatedAt: now },
          { id: "c0000002-0000-0000-0000-000000000005", assetTypeId: "a0000000-0000-0000-0000-000000000002", name: "Network Equipment", createdAt: now, updatedAt: now },
          { id: "c0000002-0000-0000-0000-000000000006", assetTypeId: "a0000000-0000-0000-0000-000000000002", name: "Server",            createdAt: now, updatedAt: now },
          // Furniture
          { id: "c0000003-0000-0000-0000-000000000001", assetTypeId: "a0000000-0000-0000-0000-000000000003", name: "Desk",              createdAt: now, updatedAt: now },
          { id: "c0000003-0000-0000-0000-000000000002", assetTypeId: "a0000000-0000-0000-0000-000000000003", name: "Chair",             createdAt: now, updatedAt: now },
          { id: "c0000003-0000-0000-0000-000000000003", assetTypeId: "a0000000-0000-0000-0000-000000000003", name: "Cabinet",           createdAt: now, updatedAt: now },
          { id: "c0000003-0000-0000-0000-000000000004", assetTypeId: "a0000000-0000-0000-0000-000000000003", name: "Shelving",          createdAt: now, updatedAt: now },
          { id: "c0000003-0000-0000-0000-000000000005", assetTypeId: "a0000000-0000-0000-0000-000000000003", name: "Examination Table", createdAt: now, updatedAt: now },
          // Office Equipment
          { id: "c0000004-0000-0000-0000-000000000001", assetTypeId: "a0000000-0000-0000-0000-000000000004", name: "Photocopier",      createdAt: now, updatedAt: now },
          { id: "c0000004-0000-0000-0000-000000000002", assetTypeId: "a0000000-0000-0000-0000-000000000004", name: "Projector",        createdAt: now, updatedAt: now },
          { id: "c0000004-0000-0000-0000-000000000003", assetTypeId: "a0000000-0000-0000-0000-000000000004", name: "Whiteboard",       createdAt: now, updatedAt: now },
          { id: "c0000004-0000-0000-0000-000000000004", assetTypeId: "a0000000-0000-0000-0000-000000000004", name: "Telephone System", createdAt: now, updatedAt: now },
          // Vehicle
          { id: "c0000005-0000-0000-0000-000000000001", assetTypeId: "a0000000-0000-0000-0000-000000000005", name: "Ambulance",        createdAt: now, updatedAt: now },
          { id: "c0000005-0000-0000-0000-000000000002", assetTypeId: "a0000000-0000-0000-0000-000000000005", name: "Staff Vehicle",    createdAt: now, updatedAt: now },
          { id: "c0000005-0000-0000-0000-000000000003", assetTypeId: "a0000000-0000-0000-0000-000000000005", name: "Delivery Vehicle", createdAt: now, updatedAt: now },
        ];
        return tx.table("assetTypes").bulkAdd(TYPES).then(() =>
          tx.table("assetCategories").bulkAdd(CATS)
        );
      });
    });
    this.version(4).stores({
      assets: "id, assetTypeId, assetCategoryId, status, custodianUserId, warehouseId, sectionId, createdAt",
      assetTransactions: "id, assetId, action, performedBy, createdAt",
    });
    this.version(5).stores({
      users: "id, username, role, status, employeeId, department",
    });
  }
}

function makeSupabaseDB() {
  const client = getSupabaseClient();
  return {
    users: new SupabaseTableAdapter<User>(client, "users"),
    products: new SupabaseTableAdapter<Product>(client, "products"),
    productUnits: new SupabaseTableAdapter<ProductUnit>(client, "product_units"),
    warehouses: new SupabaseTableAdapter<Warehouse>(client, "warehouses"),
    warehouseSections: new SupabaseTableAdapter<WarehouseSection>(
      client,
      "warehouse_sections"
    ),
    inventoryBatches: new SupabaseTableAdapter<InventoryBatch>(
      client,
      "inventory_batches"
    ),
    inventoryTransactions: new SupabaseTableAdapter<InventoryTransaction>(
      client,
      "inventory_transactions"
    ),
    auditLogs: new SupabaseTableAdapter<AuditLog>(client, "audit_logs"),
    settings: new SupabaseTableAdapter<AppSetting>(client, "settings", "key"),
    assetTypes: new SupabaseTableAdapter<AssetType>(client, "asset_types"),
    assetCategories: new SupabaseTableAdapter<AssetCategory>(client, "asset_categories"),
    assets: new SupabaseTableAdapter<Asset>(client, "assets"),
    assetTransactions: new SupabaseTableAdapter<AssetTransaction>(client, "asset_transactions"),
  };
}

export const db = isSupabaseConfigured ? makeSupabaseDB() : new StoreControlDB();

export function generateId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
