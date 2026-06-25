import Dexie, { type Table } from "dexie";
import { isSupabaseConfigured, getSupabaseClient } from "./supabase";
import { SupabaseTableAdapter } from "./db-supabase-adapter";

export interface User {
  id: string;
  username: string;
  fullName: string;
  passwordHash: string;
  role: "administrator" | "admin" | "staff";
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
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
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
  };
}

export const db = isSupabaseConfigured ? makeSupabaseDB() : new StoreControlDB();

export function generateId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
