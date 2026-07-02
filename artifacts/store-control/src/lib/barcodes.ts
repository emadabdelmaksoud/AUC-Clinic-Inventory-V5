import { db } from "./db";

export type BarcodeFormat = "CODE128" | "CODE39" | "EAN13" | "UPCA" | "QR";
export type LabelTemplate = "small" | "medium" | "large" | "qr_asset";

export interface BarcodeSettings {
  productBarcodeType: BarcodeFormat;
  assetBarcodeType: BarcodeFormat;
  productPrefix: string;
  assetPrefix: string;
  padding: number;
  autoGenerateProduct: boolean;
  autoGenerateAsset: boolean;
  defaultTemplate: LabelTemplate;
  defaultQuantity: number;
}

const KEYS = {
  productBarcodeType: "bc_product_type",
  assetBarcodeType: "bc_asset_type",
  productPrefix: "bc_product_prefix",
  assetPrefix: "bc_asset_prefix",
  padding: "bc_padding",
  autoGenerateProduct: "bc_auto_product",
  autoGenerateAsset: "bc_auto_asset",
  defaultTemplate: "bc_default_template",
  defaultQuantity: "bc_default_qty",
  productCounter: "bc_product_counter",
  assetCounter: "bc_asset_counter",
} as const;

export const BARCODE_DEFAULTS: BarcodeSettings = {
  productBarcodeType: "CODE128",
  assetBarcodeType: "QR",
  productPrefix: "PRD-",
  assetPrefix: "AST-",
  padding: 6,
  autoGenerateProduct: false,
  autoGenerateAsset: false,
  defaultTemplate: "medium",
  defaultQuantity: 1,
};

async function getSetting(key: string): Promise<string | null> {
  const row = await db.settings.get(key);
  return row?.value ?? null;
}

export async function getBarcodeSettings(): Promise<BarcodeSettings> {
  const [pType, aType, pPfx, aPfx, pad, autoPrd, autoAst, tmpl, qty] = await Promise.all([
    getSetting(KEYS.productBarcodeType),
    getSetting(KEYS.assetBarcodeType),
    getSetting(KEYS.productPrefix),
    getSetting(KEYS.assetPrefix),
    getSetting(KEYS.padding),
    getSetting(KEYS.autoGenerateProduct),
    getSetting(KEYS.autoGenerateAsset),
    getSetting(KEYS.defaultTemplate),
    getSetting(KEYS.defaultQuantity),
  ]);
  return {
    productBarcodeType: (pType as BarcodeFormat) ?? BARCODE_DEFAULTS.productBarcodeType,
    assetBarcodeType: (aType as BarcodeFormat) ?? BARCODE_DEFAULTS.assetBarcodeType,
    productPrefix: pPfx ?? BARCODE_DEFAULTS.productPrefix,
    assetPrefix: aPfx ?? BARCODE_DEFAULTS.assetPrefix,
    padding: pad ? parseInt(pad) : BARCODE_DEFAULTS.padding,
    autoGenerateProduct: autoPrd === "true",
    autoGenerateAsset: autoAst === "true",
    defaultTemplate: (tmpl as LabelTemplate) ?? BARCODE_DEFAULTS.defaultTemplate,
    defaultQuantity: qty ? parseInt(qty) : BARCODE_DEFAULTS.defaultQuantity,
  };
}

export async function saveBarcodeSettings(s: BarcodeSettings): Promise<void> {
  await Promise.all([
    db.settings.put({ key: KEYS.productBarcodeType, value: s.productBarcodeType }),
    db.settings.put({ key: KEYS.assetBarcodeType, value: s.assetBarcodeType }),
    db.settings.put({ key: KEYS.productPrefix, value: s.productPrefix }),
    db.settings.put({ key: KEYS.assetPrefix, value: s.assetPrefix }),
    db.settings.put({ key: KEYS.padding, value: String(s.padding) }),
    db.settings.put({ key: KEYS.autoGenerateProduct, value: String(s.autoGenerateProduct) }),
    db.settings.put({ key: KEYS.autoGenerateAsset, value: String(s.autoGenerateAsset) }),
    db.settings.put({ key: KEYS.defaultTemplate, value: s.defaultTemplate }),
    db.settings.put({ key: KEYS.defaultQuantity, value: String(s.defaultQuantity) }),
  ]);
}

export async function generateNextProductBarcode(settings: BarcodeSettings): Promise<string> {
  const counterRow = await db.settings.get(KEYS.productCounter);
  const next = counterRow ? parseInt(counterRow.value) + 1 : settings.padding > 0 ? 1 : 1;
  await db.settings.put({ key: KEYS.productCounter, value: String(next) });
  return `${settings.productPrefix}${String(next).padStart(settings.padding, "0")}`;
}

export async function generateNextAssetBarcode(settings: BarcodeSettings): Promise<string> {
  const counterRow = await db.settings.get(KEYS.assetCounter);
  const next = counterRow ? parseInt(counterRow.value) + 1 : 1;
  await db.settings.put({ key: KEYS.assetCounter, value: String(next) });
  return `${settings.assetPrefix}${String(next).padStart(settings.padding, "0")}`;
}

export const LABEL_TEMPLATES: Record<LabelTemplate, { name: string; description: string }> = {
  small:     { name: "Small",          description: "38 × 25 mm" },
  medium:    { name: "Medium",         description: "64 × 38 mm" },
  large:     { name: "Large",          description: "100 × 50 mm" },
  qr_asset:  { name: "QR Asset Label", description: "Full asset info" },
};

export const BARCODE_FORMAT_OPTIONS: { value: BarcodeFormat; label: string; assetsOk: boolean }[] = [
  { value: "CODE128", label: "Code 128",         assetsOk: true },
  { value: "CODE39",  label: "Code 39",           assetsOk: true },
  { value: "EAN13",   label: "EAN-13 (13 digits)", assetsOk: false },
  { value: "UPCA",    label: "UPC-A (12 digits)",  assetsOk: false },
  { value: "QR",      label: "QR Code",            assetsOk: true },
];

export const PRINT_QUANTITIES = [1, 5, 10, 20, 50, 100] as const;

export interface BarcodeOwner {
  type: "product" | "asset";
  id: string;
  name: string;
}

/**
 * Check whether a barcode is already in use by another product or asset.
 * Pass excludeId + excludeType to ignore the record being edited.
 */
export async function validateBarcodeUnique(
  barcode: string,
  excludeId?: string,
  excludeType?: "product" | "asset",
): Promise<BarcodeOwner | null> {
  const bc = barcode.trim();
  if (!bc) return null;

  // Check products
  const products = await db.products.toArray();
  const matchProduct = products.find(
    p => p.barcode === bc && !(excludeType === "product" && p.id === excludeId),
  );
  if (matchProduct) return { type: "product", id: matchProduct.id, name: matchProduct.productName };

  // Check assets
  const assets = await db.assets.toArray();
  const matchAsset = assets.find(
    a => a.barcode === bc && !(excludeType === "asset" && a.id === excludeId),
  );
  if (matchAsset) return { type: "asset", id: matchAsset.id, name: matchAsset.assetName };

  return null;
}

/** Build a set of barcode → owners map to detect ALL duplicates across the system */
export async function detectAllDuplicates(): Promise<Map<string, BarcodeOwner[]>> {
  const [products, assets] = await Promise.all([
    db.products.toArray(),
    db.assets.toArray(),
  ]);

  const map = new Map<string, BarcodeOwner[]>();

  for (const p of products) {
    if (!p.barcode?.trim()) continue;
    const key = p.barcode.trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ type: "product", id: p.id, name: p.productName });
  }
  for (const a of assets) {
    if (!a.barcode?.trim()) continue;
    const key = a.barcode.trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ type: "asset", id: a.id, name: a.assetName });
  }

  // Keep only entries with more than one owner (actual duplicates)
  for (const [k, v] of map) {
    if (v.length < 2) map.delete(k);
  }
  return map;
}
