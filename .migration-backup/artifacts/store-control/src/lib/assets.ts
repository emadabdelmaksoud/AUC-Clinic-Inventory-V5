import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { z } from "zod";
import { db, generateId, now, type AssetType, type AssetCategory, type Asset, type AssetStatus, type AssetTransaction } from "./db";

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
  custodianPhone: z.string().trim().max(50).nullable().optional(),
  custodianIdNumber: z.string().trim().max(100).nullable().optional(),
  custodianEmail: z.string().trim().email("Invalid email").max(255).nullable().optional().or(z.literal("")),
  custodianAssignmentDate: z.string().nullable().optional(),
  custodianNotes: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  warehouseId: z.string().nullable().optional(),
  sectionId: z.string().nullable().optional(),
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

export async function listAssetsByUserId(userId: string): Promise<Asset[]> {
  const assets = await db.assets.filter(a => a.custodianUserId === userId).toArray();
  return assets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAsset(id: string): Promise<Asset | undefined> {
  return db.assets.get(id);
}

function buildAssetRecord(input: AssetInput, userId: string | null, existing?: Asset): Omit<Asset, "id" | "createdBy" | "createdAt"> {
  return {
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
    custodianName: blank(input.custodianName),
    custodianPhone: blank(input.custodianPhone),
    custodianIdNumber: blank(input.custodianIdNumber),
    custodianEmail: blank(input.custodianEmail),
    custodianAssignmentDate: input.custodianAssignmentDate || null,
    custodianNotes: blank(input.custodianNotes),
    notes: blank(input.notes),
    warehouseId: blank(input.warehouseId),
    sectionId: blank(input.sectionId),
    updatedAt: now(),
  };
}

async function logAssetTransaction(
  assetId: string,
  action: AssetTransaction["action"],
  summary: string,
  userId: string | null,
  userName?: string | null,
): Promise<void> {
  try {
    await db.assetTransactions.add({
      id: generateId(),
      assetId,
      action,
      summary,
      performedBy: userId,
      performedByName: userName ?? null,
      createdAt: now(),
    });
  } catch {
    // non-blocking — history is best-effort
  }
}

export async function createAsset(input: AssetInput, userId: string | null, userName?: string | null): Promise<Asset> {
  const record: Asset = {
    id: generateId(),
    ...buildAssetRecord(input, userId),
    createdBy: userId,
    createdAt: now(),
  };
  await db.assets.add(record);
  await logAssetTransaction(record.id, "created", `Asset "${record.assetName}" created`, userId, userName);
  return record;
}

export async function updateAsset(id: string, input: AssetInput, userId: string | null, userName?: string | null): Promise<void> {
  const old = await db.assets.get(id);
  const data = buildAssetRecord(input, userId);
  await db.assets.update(id, data);

  let action: AssetTransaction["action"] = "updated";
  const parts: string[] = [];

  if (old) {
    const custodianChanged = old.custodianName !== data.custodianName || old.custodianUserId !== data.custodianUserId;
    const statusChanged = old.status !== data.status;
    const locationChanged = old.warehouseId !== data.warehouseId || old.sectionId !== data.sectionId;
    if (custodianChanged) {
      action = "custody_transferred";
      parts.push(`Custody: "${old.custodianName || "Unassigned"}" → "${data.custodianName || "Unassigned"}"`);
    }
    if (statusChanged) {
      if (!custodianChanged) action = "status_changed";
      parts.push(`Status: "${ASSET_STATUS_LABELS[old.status as AssetStatus] ?? old.status}" → "${ASSET_STATUS_LABELS[data.status as AssetStatus] ?? data.status}"`);
    }
    if (locationChanged) {
      if (!custodianChanged && !statusChanged) action = "location_changed";
      parts.push("Location updated");
    }
  }

  const summary = parts.length > 0 ? parts.join("; ") : `Asset "${data.assetName}" updated`;
  await logAssetTransaction(id, action, summary, userId, userName);
}

export async function deleteAsset(id: string, userId?: string | null, userName?: string | null): Promise<void> {
  const asset = await db.assets.get(id);
  await db.assets.delete(id);
  if (asset) {
    await logAssetTransaction(id, "deleted", `Asset "${asset.assetName}" deleted`, userId ?? null, userName);
  }
}

export async function listAssetTransactions(assetId: string): Promise<AssetTransaction[]> {
  const txns = await db.assetTransactions.filter(t => t.assetId === assetId).toArray();
  return txns.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── Search & Filter ───────────────────────────────────────────────────────────

export async function listAssetTransactionsByUser(userId: string): Promise<AssetTransaction[]> {
  const txns = await db.assetTransactions.filter(t => t.performedBy === userId).toArray();
  return txns.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface AssetFilters {
  search?: string;
  assetTypeId?: string;
  assetCategoryId?: string;
  status?: AssetStatus | "";
  warehouseId?: string;
  custodianUserId?: string;
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
      (a.custodianName ?? "").toLowerCase().includes(s) ||
      (a.custodianPhone ?? "").toLowerCase().includes(s) ||
      (a.custodianEmail ?? "").toLowerCase().includes(s)
    );
  }
  if (filters.assetTypeId) result = result.filter(a => a.assetTypeId === filters.assetTypeId);
  if (filters.assetCategoryId) result = result.filter(a => a.assetCategoryId === filters.assetCategoryId);
  if (filters.status) result = result.filter(a => a.status === filters.status);
  if (filters.warehouseId) result = result.filter(a => a.warehouseId === filters.warehouseId);
  if (filters.custodianUserId) result = result.filter(a => a.custodianUserId === filters.custodianUserId);
  return result;
}

// ── Export Helpers ────────────────────────────────────────────────────────────

function buildExportRows(assets: Asset[], types: AssetType[], categories: AssetCategory[]) {
  const typeMap = Object.fromEntries(types.map(t => [t.id, t.name]));
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  return assets.map(a => ({
    "Asset Name": a.assetName,
    "Asset Type": typeMap[a.assetTypeId] ?? a.assetTypeId,
    "Category": a.assetCategoryId ? (catMap[a.assetCategoryId] ?? "") : "",
    "FY Number": a.fyNumber ?? "",
    "FA Number": a.faNumber ?? "",
    "CC Number": a.ccNumber ?? "",
    "Serial Number": a.serialNumber ?? "",
    "Quantity": a.quantity,
    "Status": ASSET_STATUS_LABELS[a.status] ?? a.status,
    "Custodian Type": a.custodianType === "system_user" ? "System User" : a.custodianType === "external_staff" ? "External Staff" : "",
    "Custodian Name": a.custodianName ?? "",
    "Custodian Phone": a.custodianPhone ?? "",
    "Custodian ID": a.custodianIdNumber ?? "",
    "Custodian Email": a.custodianEmail ?? "",
    "Custodian Notes": a.custodianNotes ?? "",
    "Asset Notes": a.notes ?? "",
    "Created": a.createdAt.slice(0, 10),
  }));
}

// ── Excel Exports ─────────────────────────────────────────────────────────────

export async function exportFullAssetRegister(): Promise<void> {
  const [assets, types, categories] = await Promise.all([listAssets(), listAssetTypes(), listAssetCategories()]);
  const rows = buildExportRows(assets, types, categories);
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
    const rows = buildExportRows(filtered, types, categories);
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, type.name.slice(0, 31));
  }
  if (!wb.SheetNames?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "No Data");
  XLSX.writeFile(wb, `assets-by-type-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportAssetsByStatus(): Promise<void> {
  const [assets, types, categories] = await Promise.all([listAssets(), listAssetTypes(), listAssetCategories()]);
  const wb = XLSX.utils.book_new();
  const statuses: AssetStatus[] = ["active", "in_storage", "under_maintenance", "lost", "disposed"];
  for (const status of statuses) {
    const filtered = assets.filter(a => a.status === status);
    if (filtered.length === 0) continue;
    const rows = buildExportRows(filtered, types, categories);
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, ASSET_STATUS_LABELS[status]);
  }
  if (!wb.SheetNames?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "No Data");
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
    const rows = buildExportRows(group, types, categories);
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, custodian.slice(0, 31));
  }
  if (!wb.SheetNames?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "No Data");
  XLSX.writeFile(wb, `assets-by-custodian-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── PDF Exports ───────────────────────────────────────────────────────────────

const PDF_COLS = [
  { header: "Asset Name", dataKey: "assetName" },
  { header: "Type", dataKey: "type" },
  { header: "Category", dataKey: "category" },
  { header: "FY No.", dataKey: "fyNumber" },
  { header: "FA No.", dataKey: "faNumber" },
  { header: "Serial No.", dataKey: "serialNumber" },
  { header: "Qty", dataKey: "quantity" },
  { header: "Status", dataKey: "status" },
  { header: "Custodian", dataKey: "custodianName" },
  { header: "Phone", dataKey: "custodianPhone" },
  { header: "ID", dataKey: "custodianIdNumber" },
  { header: "Email", dataKey: "custodianEmail" },
];

function buildPdfRows(assets: Asset[], types: AssetType[], categories: AssetCategory[]) {
  const typeMap = Object.fromEntries(types.map(t => [t.id, t.name]));
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  return assets.map(a => ({
    assetName: a.assetName,
    type: typeMap[a.assetTypeId] ?? "",
    category: a.assetCategoryId ? (catMap[a.assetCategoryId] ?? "") : "",
    fyNumber: a.fyNumber ?? "",
    faNumber: a.faNumber ?? "",
    serialNumber: a.serialNumber ?? "",
    quantity: a.quantity,
    status: ASSET_STATUS_LABELS[a.status] ?? a.status,
    custodianName: a.custodianName ?? "",
    custodianPhone: a.custodianPhone ?? "",
    custodianIdNumber: a.custodianIdNumber ?? "",
    custodianEmail: a.custodianEmail ?? "",
  }));
}

function makePdf(title: string, rows: ReturnType<typeof buildPdfRows>, filename: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("AUC Clinic — Assets & Equipment", 14, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${title}  |  Generated: ${date}  |  Total: ${rows.length}`, 14, 21);

  autoTable(doc, {
    columns: PDF_COLS,
    body: rows,
    startY: 26,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [20, 130, 130], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 250, 250] },
    margin: { left: 14, right: 14 },
  });

  doc.save(filename);
}

export async function exportPdfFullRegister(): Promise<void> {
  const [assets, types, categories] = await Promise.all([listAssets(), listAssetTypes(), listAssetCategories()]);
  makePdf("Full Asset Register", buildPdfRows(assets, types, categories), `asset-register-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function exportPdfByType(): Promise<void> {
  const [assets, types, categories] = await Promise.all([listAssets(), listAssetTypes(), listAssetCategories()]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  let first = true;
  for (const type of types) {
    const filtered = assets.filter(a => a.assetTypeId === type.id);
    if (filtered.length === 0) continue;
    if (!first) doc.addPage();
    first = false;
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(`AUC Clinic — ${type.name}`, 14, 14);
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`Assets by Type  |  Generated: ${date}  |  Count: ${filtered.length}`, 14, 21);
    autoTable(doc, {
      columns: PDF_COLS,
      body: buildPdfRows(filtered, types, categories),
      startY: 26,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [20, 130, 130], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 250, 250] },
      margin: { left: 14, right: 14 },
    });
  }
  if (first) {
    doc.text("No data", 14, 30);
  }
  doc.save(`assets-by-type-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function exportPdfByStatus(): Promise<void> {
  const [assets, types, categories] = await Promise.all([listAssets(), listAssetTypes(), listAssetCategories()]);
  const statuses: AssetStatus[] = ["active", "in_storage", "under_maintenance", "lost", "disposed"];
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  let first = true;
  for (const status of statuses) {
    const filtered = assets.filter(a => a.status === status);
    if (filtered.length === 0) continue;
    if (!first) doc.addPage();
    first = false;
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(`AUC Clinic — ${ASSET_STATUS_LABELS[status]}`, 14, 14);
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`Assets by Status  |  Generated: ${date}  |  Count: ${filtered.length}`, 14, 21);
    autoTable(doc, {
      columns: PDF_COLS,
      body: buildPdfRows(filtered, types, categories),
      startY: 26,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [20, 130, 130], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 250, 250] },
      margin: { left: 14, right: 14 },
    });
  }
  if (first) doc.text("No data", 14, 30);
  doc.save(`assets-by-status-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function exportPdfByCustodian(): Promise<void> {
  const [assets, types, categories] = await Promise.all([listAssets(), listAssetTypes(), listAssetCategories()]);
  const custodianMap = new Map<string, Asset[]>();
  for (const a of assets) {
    const key = a.custodianName || (a.custodianType ? "Assigned (no name)" : "Unassigned");
    if (!custodianMap.has(key)) custodianMap.set(key, []);
    custodianMap.get(key)!.push(a);
  }
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  let first = true;
  for (const [custodian, group] of custodianMap) {
    if (!first) doc.addPage();
    first = false;
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(`AUC Clinic — Custodian: ${custodian}`, 14, 14);
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    const a0 = group[0];
    const infoLine = [a0.custodianPhone, a0.custodianEmail, a0.custodianIdNumber].filter(Boolean).join(" | ");
    doc.text(`Assets by Custodian  |  Generated: ${date}${infoLine ? "  |  " + infoLine : ""}`, 14, 21);
    autoTable(doc, {
      columns: PDF_COLS,
      body: buildPdfRows(group, types, categories),
      startY: 26,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [20, 130, 130], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 250, 250] },
      margin: { left: 14, right: 14 },
    });
  }
  if (first) doc.text("No data", 14, 30);
  doc.save(`assets-by-custodian-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function exportPdfMyCustody(assets: Asset[], types: AssetType[], categories: AssetCategory[], custodianName: string): Promise<void> {
  makePdf(`My Custody — ${custodianName}`, buildPdfRows(assets, types, categories), `my-custody-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ── Excel Import ──────────────────────────────────────────────────────────────

export async function downloadImportTemplate(): Promise<void> {
  const template = [{
    "Asset Name": "Example Laptop",
    "Asset Type": "IT Equipment",
    "Category": "Laptop",
    "FY Number": "FY-2024-001",
    "FA Number": "FA-001",
    "CC Number": "CC-001",
    "Serial Number": "SN-12345",
    "Quantity": 1,
    "Status": "Active",
    "Custodian Name": "",
    "Custodian Phone": "",
    "Custodian ID": "",
    "Custodian Email": "",
    "Custodian Notes": "",
    "Asset Notes": "",
    "Warehouse": "",
    "Section": "",
  }];
  const ws = XLSX.utils.json_to_sheet(template);
  ws["!cols"] = Object.keys(template[0]).map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Assets");
  XLSX.writeFile(wb, "assets-import-template.xlsx");
}

export async function importAssetsFromExcel(
  file: File,
  userId: string | null,
  userName?: string | null,
): Promise<{ imported: number; errors: string[] }> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const [allTypes, allCats] = await Promise.all([listAssetTypes(), listAssetCategories()]);
  const allWarehouses = await db.warehouses.toArray();
  const allSections = await db.warehouseSections.toArray();

  const typeMap = new Map(allTypes.map(t => [t.name.trim().toLowerCase(), t.id]));
  const catMap = new Map(allCats.map(c => [`${c.assetTypeId}::${c.name.trim().toLowerCase()}`, c.id]));
  const warehouseMap = new Map(allWarehouses.map(w => [w.warehouseName.trim().toLowerCase(), w.id]));
  const sectionMap = new Map(allSections.map(s => [`${s.warehouseId}::${s.sectionName.trim().toLowerCase()}`, s.id]));

  const STATUS_IMPORT_MAP: Record<string, AssetStatus> = {
    "active": "active",
    "in storage": "in_storage",
    "in_storage": "in_storage",
    "under maintenance": "under_maintenance",
    "under_maintenance": "under_maintenance",
    "lost": "lost",
    "disposed": "disposed",
  };

  let imported = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    try {
      const assetName = String(row["Asset Name"] ?? "").trim();
      if (!assetName) { errors.push(`Row ${rowNum}: "Asset Name" is required`); continue; }

      const typeName = String(row["Asset Type"] ?? "").trim();
      const typeId = typeMap.get(typeName.toLowerCase());
      if (!typeId) { errors.push(`Row ${rowNum}: Asset Type "${typeName}" not found`); continue; }

      const catName = String(row["Category"] ?? "").trim();
      const catId = catName ? (catMap.get(`${typeId}::${catName.toLowerCase()}`) ?? null) : null;

      const whName = String(row["Warehouse"] ?? "").trim();
      const warehouseId = whName ? (warehouseMap.get(whName.toLowerCase()) ?? null) : null;

      const secName = String(row["Section"] ?? "").trim();
      const sectionId = (secName && warehouseId) ? (sectionMap.get(`${warehouseId}::${secName.toLowerCase()}`) ?? null) : null;

      const statusRaw = String(row["Status"] ?? "Active").trim().toLowerCase();
      const status: AssetStatus = STATUS_IMPORT_MAP[statusRaw] ?? "active";

      const qty = Number(row["Quantity"] ?? 1);
      const quantity = isNaN(qty) || qty < 1 ? 1 : Math.floor(qty);

      const record: Asset = {
        id: generateId(),
        assetName,
        assetTypeId: typeId,
        assetCategoryId: catId,
        fyNumber: String(row["FY Number"] ?? "").trim() || null,
        faNumber: String(row["FA Number"] ?? "").trim() || null,
        ccNumber: String(row["CC Number"] ?? "").trim() || null,
        serialNumber: String(row["Serial Number"] ?? "").trim() || null,
        quantity,
        status,
        custodianType: null,
        custodianUserId: null,
        custodianName: String(row["Custodian Name"] ?? "").trim() || null,
        custodianPhone: String(row["Custodian Phone"] ?? "").trim() || null,
        custodianIdNumber: String(row["Custodian ID"] ?? "").trim() || null,
        custodianEmail: String(row["Custodian Email"] ?? "").trim() || null,
        custodianAssignmentDate: null,
        custodianNotes: String(row["Custodian Notes"] ?? "").trim() || null,
        notes: String(row["Asset Notes"] ?? "").trim() || null,
        warehouseId,
        sectionId,
        createdBy: userId,
        createdAt: now(),
        updatedAt: now(),
      };

      await db.assets.add(record);
      await logAssetTransaction(record.id, "imported", `Asset "${assetName}" imported from Excel`, userId, userName);
      imported++;
    } catch (e) {
      errors.push(`Row ${rowNum}: ${(e as Error).message}`);
    }
  }

  return { imported, errors };
}
