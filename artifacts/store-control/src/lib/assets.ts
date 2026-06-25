import * as XLSX from "xlsx";
import { z } from "zod";
import { db, generateId, now, type AssetType, type AssetCategory, type Asset, type AssetStatus, type CustodianType } from "./db";

// ── Schemas ───────────────────────────────────────────────────────────────────

export const assetTypeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});
export type AssetTypeInput = z.infer<typeof assetTypeSchema>;

export const assetCategorySchema = z.object({
  assetTypeId: z.string().min(1, "Asset type is required"),
  name: z.string().trim().min(1, "Name is required").max(100),
});
export type AssetCategoryInput = z.infer<typeof assetCategorySchema>;

export const assetSchema = z.object({
  assetName: z.string().trim().min(1, "Asset name is required").max(255),
  assetTypeId: z.string().min(1, "Asset type is required"),
  assetCategoryId: z.string().nullable().optional(),
  fyNumber: z.string().trim().max(100).nullable().optional(),
  faNumber: z.string().trim().max(100).nullable().optional(),
  ccNumber: z.string().trim().max(100).nullable().optional(),
  serialNumber: z.string().trim().max(100).nullable().optional(),
  quantity: z.coerce.number().int().min(1).default(1),
  status: z.enum(["active", "in_storage", "under_maintenance", "lost", "disposed"]).default("active"),
  custodianType: z.enum(["system_user", "external_staff"]).nullable().optional(),
  custodianUserId: z.string().nullable().optional(),
  custodianName: z.string().trim().max(255).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type AssetInput = z.infer<typeof assetSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function blank(v?: string | null): string | null {
  return v && v.trim().length > 0 ? v.trim() : null;
}

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  active: "Active",
  in_storage: "In Storage",
  under_maintenance: "Under Maintenance",
  lost: "Lost",
  disposed: "Disposed",
};

export const DEFAULT_ASSET_TYPES = [
  "Medical Equipment",
  "IT Equipment",
  "Furniture",
  "Office Equipment",
  "Vehicle",
  "Other",
];

export const DEFAULT_ASSET_CATEGORIES: Record<string, string[]> = {
  "IT Equipment": ["Laptop", "Desktop Computer", "Printer"],
  Furniture: ["Desk", "Chair", "Cabinet"],
};

// ── Asset Types CRUD ──────────────────────────────────────────────────────────

export async function listAssetTypes(): Promise<AssetType[]> {
  const types = await db.assetTypes.toArray();
  return types.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createAssetType(input: AssetTypeInput): Promise<AssetType> {
  const existing = await db.assetTypes.filter(t => t.name.toLowerCase() === input.name.toLowerCase()).toArray();
  if (existing.length > 0) throw new Error(`Asset type "${input.name}" already exists`);
  const record: AssetType = { id: generateId(), name: input.name.trim(), createdAt: now(), updatedAt: now() };
  await db.assetTypes.add(record);
  return record;
}

export async function updateAssetType(id: string, input: AssetTypeInput): Promise<void> {
  const existing = await db.assetTypes.filter(t => t.name.toLowerCase() === input.name.toLowerCase() && t.id !== id).toArray();
  if (existing.length > 0) throw new Error(`Asset type "${input.name}" already exists`);
  await db.assetTypes.update(id, { name: input.name.trim(), updatedAt: now() });
}

export async function deleteAssetType(id: string): Promise<void> {
  const cats = await db.assetCategories.filter(c => c.assetTypeId === id).toArray();
  if (cats.length > 0) throw new Error("Cannot delete: this type has categories. Remove them first.");
  const linked = await db.assets.filter(a => a.assetTypeId === id).toArray();
  if (linked.length > 0) throw new Error("Cannot delete: assets are using this type.");
  await db.assetTypes.delete(id);
}

export async function seedDefaultAssetTypes(): Promise<void> {
  const existing = await db.assetTypes.toArray();
  if (existing.length > 0) return;
  for (const name of DEFAULT_ASSET_TYPES) {
    const id = generateId();
    await db.assetTypes.add({ id, name, createdAt: now(), updatedAt: now() });
    if (DEFAULT_ASSET_CATEGORIES[name]) {
      for (const catName of DEFAULT_ASSET_CATEGORIES[name]) {
        await db.assetCategories.add({ id: generateId(), assetTypeId: id, name: catName, createdAt: now(), updatedAt: now() });
      }
    }
  }
}

// ── Asset Categories CRUD ─────────────────────────────────────────────────────

export async function listAssetCategories(assetTypeId?: string): Promise<AssetCategory[]> {
  const all = assetTypeId
    ? await db.assetCategories.filter(c => c.assetTypeId === assetTypeId).toArray()
    : await db.assetCategories.toArray();
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createAssetCategory(input: AssetCategoryInput): Promise<AssetCategory> {
  const existing = await db.assetCategories
    .filter(c => c.assetTypeId === input.assetTypeId && c.name.toLowerCase() === input.name.toLowerCase())
    .toArray();
  if (existing.length > 0) throw new Error(`Category "${input.name}" already exists in this type`);
  const record: AssetCategory = { id: generateId(), assetTypeId: input.assetTypeId, name: input.name.trim(), createdAt: now(), updatedAt: now() };
  await db.assetCategories.add(record);
  return record;
}

export async function updateAssetCategory(id: string, input: AssetCategoryInput): Promise<void> {
  const existing = await db.assetCategories
    .filter(c => c.assetTypeId === input.assetTypeId && c.name.toLowerCase() === input.name.toLowerCase() && c.id !== id)
    .toArray();
  if (existing.length > 0) throw new Error(`Category "${input.name}" already exists in this type`);
  await db.assetCategories.update(id, { name: input.name.trim(), assetTypeId: input.assetTypeId, updatedAt: now() });
}

export async function deleteAssetCategory(id: string): Promise<void> {
  const linked = await db.assets.filter(a => a.assetCategoryId === id).toArray();
  if (linked.length > 0) throw new Error("Cannot delete: assets are using this category.");
  await db.assetCategories.delete(id);
}

// ── Assets CRUD ───────────────────────────────────────────────────────────────

export async function listAssets(): Promise<Asset[]> {
  const assets = await db.assets.toArray();
  return assets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAsset(id: string): Promise<Asset | undefined> {
  return db.assets.get(id);
}

export async function createAsset(input: AssetInput, userId: string | null): Promise<Asset> {
  const record: Asset = {
    id: generateId(),
    assetName: input.assetName,
    assetTypeId: input.assetTypeId,
    assetCategoryId: blank(input.assetCategoryId as string | null | undefined),
    fyNumber: blank(input.fyNumber),
    faNumber: blank(input.faNumber),
    ccNumber: blank(input.ccNumber),
    serialNumber: blank(input.serialNumber),
    quantity: input.quantity ?? 1,
    status: input.status ?? "active",
    custodianType: input.custodianType ?? null,
    custodianUserId: input.custodianType === "system_user" ? blank(input.custodianUserId) : null,
    custodianName: input.custodianType === "system_user" ? null : blank(input.custodianName),
    notes: blank(input.notes),
    createdBy: userId,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.assets.add(record);
  return record;
}

export async function updateAsset(id: string, input: AssetInput, _userId: string | null): Promise<void> {
  await db.assets.update(id, {
    assetName: input.assetName,
    assetTypeId: input.assetTypeId,
    assetCategoryId: blank(input.assetCategoryId as string | null | undefined),
    fyNumber: blank(input.fyNumber),
    faNumber: blank(input.faNumber),
    ccNumber: blank(input.ccNumber),
    serialNumber: blank(input.serialNumber),
    quantity: input.quantity ?? 1,
    status: input.status ?? "active",
    custodianType: input.custodianType ?? null,
    custodianUserId: input.custodianType === "system_user" ? blank(input.custodianUserId) : null,
    custodianName: input.custodianType === "system_user" ? null : blank(input.custodianName),
    notes: blank(input.notes),
    updatedAt: now(),
  });
}

export async function deleteAsset(id: string): Promise<void> {
  await db.assets.delete(id);
}

// ── Search & Filter ───────────────────────────────────────────────────────────

export interface AssetFilters {
  search?: string;
  assetTypeId?: string;
  assetCategoryId?: string;
  status?: AssetStatus | "";
}

export function filterAssets(assets: Asset[], filters: AssetFilters): Asset[] {
  let result = assets;
  if (filters.search && filters.search.trim()) {
    const s = filters.search.trim().toLowerCase();
    result = result.filter(a =>
      a.assetName.toLowerCase().includes(s) ||
      (a.serialNumber ?? "").toLowerCase().includes(s) ||
      (a.fyNumber ?? "").toLowerCase().includes(s) ||
      (a.faNumber ?? "").toLowerCase().includes(s) ||
      (a.ccNumber ?? "").toLowerCase().includes(s) ||
      (a.custodianName ?? "").toLowerCase().includes(s)
    );
  }
  if (filters.assetTypeId) result = result.filter(a => a.assetTypeId === filters.assetTypeId);
  if (filters.assetCategoryId) result = result.filter(a => a.assetCategoryId === filters.assetCategoryId);
  if (filters.status) result = result.filter(a => a.status === filters.status);
  return result;
}

// ── Excel Exports ─────────────────────────────────────────────────────────────

async function buildExportRows(assets: Asset[], types: AssetType[], categories: AssetCategory[]) {
  const typeMap = Object.fromEntries(types.map(t => [t.id, t.name]));
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  return assets.map(a => ({
    "Asset Name": a.assetName,
    "Asset Type": typeMap[a.assetTypeId] ?? a.assetTypeId,
    "Category": a.assetCategoryId ? (catMap[a.assetCategoryId] ?? a.assetCategoryId) : "",
    "FY Number": a.fyNumber ?? "",
    "FA Number": a.faNumber ?? "",
    "CC Number": a.ccNumber ?? "",
    "Serial Number": a.serialNumber ?? "",
    "Quantity": a.quantity,
    "Status": ASSET_STATUS_LABELS[a.status] ?? a.status,
    "Custodian Type": a.custodianType === "system_user" ? "System User" : a.custodianType === "external_staff" ? "External Staff" : "",
    "Custodian": a.custodianName ?? "",
    "Notes": a.notes ?? "",
    "Created": a.createdAt.slice(0, 10),
  }));
}

export async function exportFullAssetRegister(): Promise<void> {
  const [assets, types, categories] = await Promise.all([listAssets(), listAssetTypes(), listAssetCategories()]);
  const rows = await buildExportRows(assets, types, categories);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Full Asset Register");
  XLSX.writeFile(wb, `asset-register-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportAssetsByType(): Promise<void> {
  const [assets, types, categories] = await Promise.all([listAssets(), listAssetTypes(), listAssetCategories()]);
  const wb = XLSX.utils.book_new();
  for (const type of types) {
    const filtered = assets.filter(a => a.assetTypeId === type.id);
    if (filtered.length === 0) continue;
    const rows = await buildExportRows(filtered, types, categories);
    const ws = XLSX.utils.json_to_sheet(rows);
    const sheetName = type.name.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  if (!wb.SheetNames?.length) {
    const ws = XLSX.utils.json_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, ws, "No Data");
  }
  XLSX.writeFile(wb, `assets-by-type-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportAssetsByStatus(): Promise<void> {
  const [assets, types, categories] = await Promise.all([listAssets(), listAssetTypes(), listAssetCategories()]);
  const wb = XLSX.utils.book_new();
  const statuses: AssetStatus[] = ["active", "in_storage", "under_maintenance", "lost", "disposed"];
  for (const status of statuses) {
    const filtered = assets.filter(a => a.status === status);
    if (filtered.length === 0) continue;
    const rows = await buildExportRows(filtered, types, categories);
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, ASSET_STATUS_LABELS[status]);
  }
  if (!wb.SheetNames?.length) {
    const ws = XLSX.utils.json_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, ws, "No Data");
  }
  XLSX.writeFile(wb, `assets-by-status-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportAssetsByCustodian(): Promise<void> {
  const [assets, types, categories] = await Promise.all([listAssets(), listAssetTypes(), listAssetCategories()]);
  const custodianMap = new Map<string, Asset[]>();
  for (const a of assets) {
    const key = a.custodianName || (a.custodianType ? "Assigned (no name)" : "Unassigned");
    if (!custodianMap.has(key)) custodianMap.set(key, []);
    custodianMap.get(key)!.push(a);
  }
  const wb = XLSX.utils.book_new();
  for (const [custodian, group] of custodianMap) {
    const rows = await buildExportRows(group, types, categories);
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, custodian.slice(0, 31));
  }
  if (!wb.SheetNames?.length) {
    const ws = XLSX.utils.json_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, ws, "No Data");
  }
  XLSX.writeFile(wb, `assets-by-custodian-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
