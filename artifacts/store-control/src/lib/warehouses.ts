import { db, type Warehouse, type WarehouseSection, generateId, now } from "./db";
import { addAuditLog } from "./audit";
import { z } from "zod";

export const warehouseSchema = z.object({
  warehouseCode: z.string().trim().max(50).optional().or(z.literal("")),
  warehouseName: z.string().trim().min(1, "Warehouse name is required").max(255),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});
export type WarehouseInput = z.infer<typeof warehouseSchema>;

export const sectionSchema = z.object({
  sectionName: z.string().trim().min(1, "Section name is required").max(255),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});
export type SectionInput = z.infer<typeof sectionSchema>;

const blank = (v?: string | null) => (v && v.length ? v : null);

async function generateWarehouseCode(): Promise<string> {
  const count = await db.warehouses.count();
  return `WH-${String(count + 1).padStart(4, "0")}`;
}

export async function listWarehouses(search?: string): Promise<Warehouse[]> {
  let warehouses: Warehouse[];
  if (search?.trim()) {
    const s = search.trim().toLowerCase();
    warehouses = await db.warehouses.filter((w) =>
      w.warehouseName.toLowerCase().includes(s) ||
      w.warehouseCode.toLowerCase().includes(s)
    ).toArray();
  } else {
    warehouses = await db.warehouses.toArray();
  }
  return warehouses.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getWarehouse(id: string): Promise<Warehouse | undefined> {
  return db.warehouses.get(id);
}

export async function createWarehouse(input: WarehouseInput, userId?: string): Promise<Warehouse> {
  const code = await generateWarehouseCode();
  const wh: Warehouse = {
    id: generateId(),
    warehouseCode: input.warehouseCode || code,
    warehouseName: input.warehouseName,
    description: blank(input.description),
    isActive: input.isActive ?? true,
    createdBy: userId ?? null,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.warehouses.add(wh);
  await addAuditLog({ action: "create", tableName: "warehouses", recordId: wh.id, userId: userId ?? null, changes: JSON.stringify(wh) });
  return wh;
}

export async function updateWarehouse(id: string, input: WarehouseInput, userId?: string): Promise<void> {
  const changes = {
    warehouseName: input.warehouseName,
    description: blank(input.description),
    isActive: input.isActive ?? true,
    updatedAt: now(),
  };
  await db.warehouses.update(id, changes);
  await addAuditLog({ action: "update", tableName: "warehouses", recordId: id, userId: userId ?? null, changes: JSON.stringify(changes) });
}

export async function deleteWarehouse(id: string, userId?: string): Promise<void> {
  await db.warehouses.delete(id);
  await db.warehouseSections.where("warehouseId").equals(id).delete();
  await addAuditLog({ action: "delete", tableName: "warehouses", recordId: id, userId: userId ?? null, changes: "{}" });
}

export async function listSections(warehouseId: string): Promise<WarehouseSection[]> {
  return db.warehouseSections.where("warehouseId").equals(warehouseId).toArray();
}

export async function createSection(warehouseId: string, input: SectionInput, userId?: string): Promise<WarehouseSection> {
  const section: WarehouseSection = {
    id: generateId(),
    warehouseId,
    sectionName: input.sectionName,
    description: blank(input.description),
    isActive: input.isActive ?? true,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.warehouseSections.add(section);
  await addAuditLog({ action: "create", tableName: "warehouse_sections", recordId: section.id, userId: userId ?? null, changes: JSON.stringify(section) });
  return section;
}

export async function updateSection(id: string, input: SectionInput, userId?: string): Promise<void> {
  const changes = { sectionName: input.sectionName, description: blank(input.description), isActive: input.isActive ?? true, updatedAt: now() };
  await db.warehouseSections.update(id, changes);
  await addAuditLog({ action: "update", tableName: "warehouse_sections", recordId: id, userId: userId ?? null, changes: JSON.stringify(changes) });
}

export async function deleteSection(id: string, userId?: string): Promise<void> {
  await db.warehouseSections.delete(id);
  await addAuditLog({ action: "delete", tableName: "warehouse_sections", recordId: id, userId: userId ?? null, changes: "{}" });
}
