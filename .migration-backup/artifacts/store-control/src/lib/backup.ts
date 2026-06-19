import { db } from "./db";
import * as XLSX from "xlsx";

export async function exportBackup(): Promise<void> {
  const [products, productUnits, warehouses, sections, batches, transactions, users, auditLogs] = await Promise.all([
    db.products.toArray(),
    db.productUnits.toArray(),
    db.warehouses.toArray(),
    db.warehouseSections.toArray(),
    db.inventoryBatches.toArray(),
    db.inventoryTransactions.toArray(),
    db.users.toArray().then(us => us.map(({ passwordHash: _ph, ...u }) => u)),
    db.auditLogs.toArray(),
  ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    version: 1,
    data: { products, productUnits, warehouses, sections, batches, transactions, users, auditLogs },
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `store-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBackup(file: File): Promise<{ imported: number }> {
  const text = await file.text();
  const backup = JSON.parse(text);
  if (!backup.data) throw new Error("Invalid backup file");
  const d = backup.data;

  if (d.products?.length) await db.products.bulkPut(d.products);
  if (d.productUnits?.length) await db.productUnits.bulkPut(d.productUnits);
  if (d.warehouses?.length) await db.warehouses.bulkPut(d.warehouses);
  if (d.sections?.length) await db.warehouseSections.bulkPut(d.sections);
  if (d.batches?.length) await db.inventoryBatches.bulkPut(d.batches);
  if (d.transactions?.length) await db.inventoryTransactions.bulkPut(d.transactions);

  const total = [d.products, d.productUnits, d.warehouses, d.sections, d.batches, d.transactions]
    .reduce((s, arr) => s + (arr?.length ?? 0), 0);

  return { imported: total };
}

export async function exportProductsExcel(): Promise<void> {
  const products = await db.products.toArray();
  const ws = XLSX.utils.json_to_sheet(products.map(p => ({
    "Product Code": p.productCode,
    "Product Name": p.productName,
    "Barcode": p.barcode ?? "",
    "Category": p.category ?? "",
    "Manufacturer": p.manufacturer ?? "",
    "Base Unit": p.baseUnit,
    "Reorder Level": p.reorderLevel,
    "Notes": p.notes ?? "",
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  XLSX.writeFile(wb, `products-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportInventoryExcel(): Promise<void> {
  const [batches, products, warehouses, sections] = await Promise.all([
    db.inventoryBatches.filter(b => b.quantityBaseUnit > 0).toArray(),
    db.products.toArray(),
    db.warehouses.toArray(),
    db.warehouseSections.toArray(),
  ]);
  const productMap = new Map(products.map(p => [p.id, p]));
  const warehouseMap = new Map(warehouses.map(w => [w.id, w]));
  const sectionMap = new Map(sections.map(s => [s.id, s]));

  const ws = XLSX.utils.json_to_sheet(batches.map(b => ({
    "Product Code": productMap.get(b.productId)?.productCode ?? "",
    "Product Name": productMap.get(b.productId)?.productName ?? "",
    "Warehouse": warehouseMap.get(b.warehouseId)?.warehouseName ?? "",
    "Section": b.sectionId ? (sectionMap.get(b.sectionId)?.sectionName ?? "") : "",
    "Batch Number": b.batchNumber ?? "",
    "Expiry Date": b.expiryDate ?? "",
    "Quantity (Base Unit)": b.quantityBaseUnit,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory");
  XLSX.writeFile(wb, `inventory-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function importProductsFromExcel(file: File): Promise<{ imported: number; errors: string[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  const errors: string[] = [];
  let imported = 0;

  for (const row of rows) {
    const name = String(row["Product Name"] ?? "").trim();
    if (!name) { errors.push("Row missing Product Name"); continue; }

    try {
      const existing = await db.products.filter(p => p.productName.toLowerCase() === name.toLowerCase()).first();
      if (existing) { errors.push(`Product "${name}" already exists — skipped`); continue; }

      const count = await db.products.count();
      const { generateId, now } = await import("./db");
      await db.products.add({
        id: generateId(),
        productCode: String(row["Product Code"] ?? `PRD-${String(count + 1).padStart(6, "0")}`).trim(),
        productName: name,
        barcode: String(row["Barcode"] ?? "").trim() || null,
        category: String(row["Category"] ?? "").trim() || null,
        manufacturer: String(row["Manufacturer"] ?? "").trim() || null,
        baseUnit: String(row["Base Unit"] ?? "unit").trim() || "unit",
        reorderLevel: Number(row["Reorder Level"] ?? 0),
        notes: String(row["Notes"] ?? "").trim() || null,
        createdBy: null,
        createdAt: now(),
        updatedAt: now(),
      });
      imported++;
    } catch (e) {
      errors.push(`Row "${name}": ${(e as Error).message}`);
    }
  }

  return { imported, errors };
}
