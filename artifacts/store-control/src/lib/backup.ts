import { db, generateId, now } from "./db";
import * as XLSX from "xlsx";
import type { TxnRow, StockSummaryRow } from "./reports";
import { upsertBatch, recordTransaction } from "./inventory";

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

export async function exportTransactionsExcel(rows: TxnRow[], label = "transactions"): Promise<void> {
  const TRANSACTION_LABELS: Record<string, string> = {
    stock_in: "Stock In", dispensing: "Dispensing", transfer_in: "Transfer In",
    transfer_out: "Transfer Out", disposal: "Disposal", adjustment: "Adjustment",
    inventory_count: "Inventory Count",
  };
  const ws = XLSX.utils.json_to_sheet(rows.map(t => ({
    "Date": t.createdAt.slice(0, 16).replace("T", " "),
    "Type": TRANSACTION_LABELS[t.transactionType] ?? t.transactionType,
    "Product Code": t.productCode,
    "Product Name": t.productName,
    "Category": t.category ?? "",
    "Quantity": t.quantity,
    "Unit": t.unitName ?? "",
    "Qty (Base Unit)": t.quantityBaseUnit,
    "Warehouse": t.warehouseName,
    "Section": t.sectionName ?? "",
    "Batch Number": t.batchNumber ?? "",
    "Expiry Date": t.expiryDate ?? "",
    "Performed By": t.performedByName ?? "",
    "Notes": t.notes ?? "",
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Transactions");
  XLSX.writeFile(wb, `${label}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportStockSummaryExcel(rows: StockSummaryRow[]): Promise<void> {
  const ws = XLSX.utils.json_to_sheet(rows.map(p => ({
    "Product Code": p.productCode,
    "Product Name": p.productName,
    "Category": p.category ?? "",
    "On Hand (Base Unit)": p.onHandBase,
    "Base Unit": p.baseUnit,
    "Reorder Level": p.reorderLevel,
    "Active Batches": p.batchCount,
    "Near Expiry Batches": p.nearExpiry,
    "Expired Batches": p.expired,
    "Status": p.expired > 0 ? "Expired" : p.nearExpiry > 0 ? "Near Expiry" :
      (p.reorderLevel > 0 && p.onHandBase < p.reorderLevel) ? "Low Stock" : "OK",
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stock Summary");
  XLSX.writeFile(wb, `stock-summary-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function downloadStockImportTemplate(): void {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Product Code", "Product Name", "Warehouse", "Batch Number", "Expiry Date (YYYY-MM-DD)", "Quantity", "Unit"],
    ["PRD-000001", "Paracetamol 500mg", "Main Clinic", "LOT-2024-01", "2026-12-31", "500", "tablet"],
    ["PRD-000002", "Amoxicillin 250mg", "Main Clinic", "", "", "200", "capsule"],
  ]);
  ws["!cols"] = [16, 24, 18, 18, 24, 10, 12].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stock Import Template");
  XLSX.writeFile(wb, "stock-import-template.xlsx");
}

export async function importStockInFromExcel(
  file: File,
  performedBy: string | null
): Promise<{ imported: number; errors: string[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  const errors: string[] = [];
  let imported = 0;

  const [products, warehouses, allUnits] = await Promise.all([
    db.products.toArray(),
    db.warehouses.toArray(),
    db.productUnits.toArray(),
  ]);

  const productByCode = new Map(products.map(p => [p.productCode.toLowerCase(), p]));
  const productByName = new Map(products.map(p => [p.productName.toLowerCase(), p]));
  const warehouseByName = new Map(warehouses.map(w => [w.warehouseName.toLowerCase(), w]));
  const warehouseByCode = new Map(warehouses.map(w => [w.warehouseCode.toLowerCase(), w]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    try {
      const code = String(row["Product Code"] ?? "").trim().toLowerCase();
      const name = String(row["Product Name"] ?? "").trim().toLowerCase();
      const product = (code ? productByCode.get(code) : null) ?? (name ? productByName.get(name) : null);
      if (!product) {
        errors.push(`Row ${rowNum}: product "${row["Product Code"] ?? row["Product Name"]}" not found — add it in Products first`);
        continue;
      }

      const whRaw = String(row["Warehouse"] ?? "").trim().toLowerCase();
      const warehouse = warehouseByName.get(whRaw) ?? warehouseByCode.get(whRaw);
      if (!warehouse) {
        errors.push(`Row ${rowNum}: warehouse "${row["Warehouse"]}" not found`);
        continue;
      }

      const qty = Number(row["Quantity"] ?? 0);
      if (!qty || qty <= 0) {
        errors.push(`Row ${rowNum}: invalid quantity "${row["Quantity"]}"`);
        continue;
      }

      const unitRaw = String(row["Unit"] ?? "").trim().toLowerCase();
      const productUnits = allUnits.filter(u => u.productId === product.id);
      const unit = unitRaw
        ? productUnits.find(u => u.unitName.toLowerCase() === unitRaw)
        : productUnits.find(u => u.isBase);
      const baseUnit = productUnits.find(u => u.isBase);

      if (unitRaw && !unit) {
        errors.push(`Row ${rowNum}: unit "${row["Unit"]}" not found for ${product.productName}`);
        continue;
      }

      const resolvedUnit = unit ?? baseUnit;
      if (!resolvedUnit) {
        errors.push(`Row ${rowNum}: no base unit configured for ${product.productName}`);
        continue;
      }

      const batchNumber = String(row["Batch Number"] ?? "").trim() || null;
      const expiryRaw = String(row["Expiry Date (YYYY-MM-DD)"] ?? row["Expiry Date"] ?? "").trim();
      const expiryDate = expiryRaw && /^\d{4}-\d{2}-\d{2}$/.test(expiryRaw) ? expiryRaw : null;

      const batch = await upsertBatch({
        productId: product.id,
        warehouseId: warehouse.id,
        sectionId: null,
        batchNumber,
        expiryDate,
      });

      await recordTransaction(
        {
          transactionType: "stock_in",
          productId: product.id,
          batchId: batch.id,
          warehouseId: warehouse.id,
          sectionId: null,
          quantity: qty,
          unitId: resolvedUnit.id,
          notes: `Bulk import from Excel`,
          performedBy,
        },
        resolvedUnit.factorToBase
      );

      imported++;
    } catch (e) {
      errors.push(`Row ${rowNum}: ${(e as Error).message}`);
    }
  }

  return { imported, errors };
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
