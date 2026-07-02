import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import JsBarcode from "jsbarcode";
import QRCodeLib from "qrcode";
import { listProducts, setProductBarcode } from "@/lib/products";
import { listAssets, setAssetBarcode } from "@/lib/assets";
import { listProductUnits } from "@/lib/product-units";
import { useAuth } from "@/lib/auth";
import {
  getBarcodeSettings, saveBarcodeSettings, generateNextProductBarcode,
  generateNextAssetBarcode, BARCODE_DEFAULTS,
  LABEL_TEMPLATES, BARCODE_FORMAT_OPTIONS, PRINT_QUANTITIES,
  validateBarcodeUnique, detectAllDuplicates,
  type BarcodeSettings, type BarcodeFormat, type LabelTemplate, type BarcodeOwner,
} from "@/lib/barcodes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  QrCode, Search, Printer, Settings, ScanLine, Package,
  Briefcase, Plus, Minus, RefreshCw,
  AlertCircle, Save, ChevronRight, Keyboard, Camera, CameraOff,
  Zap, ZapOff, SwitchCamera, CheckCircle2, Clock, Trash2,
  ExternalLink, RotateCcw, X, FileText, Upload, BarChart3,
  ArrowRight, CheckSquare,
} from "lucide-react";
import { toast } from "sonner";
import type { Asset, Product } from "@/lib/db";

// Scan history entry
interface ScanRecord {
  id: number;
  code: string;
  time: Date;
  resultType: "product" | "asset" | "not_found";
  name?: string;
}

// ── Barcode renderers ──────────────────────────────────────────────────────────

function LinearBarcode({ value, format, height = 50, fontSize = 10 }: {
  value: string; format: BarcodeFormat; height?: number; fontSize?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format,
        displayValue: true,
        fontSize,
        height,
        margin: 4,
        textMargin: 2,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      // invalid value for format (e.g. letters in EAN13)
      if (ref.current) ref.current.innerHTML = "";
    }
  }, [value, format, height, fontSize]);
  return <svg ref={ref} />;
}

function QRCodeDisplay({ value, size = 100 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    if (!value) return;
    QRCodeLib.toString(value, { type: "svg", width: size, margin: 1, color: { dark: "#000000", light: "#ffffff" } })
      .then(s => setSvg(s))
      .catch(() => setSvg(""));
  }, [value, size]);
  if (!svg) return <div style={{ width: size, height: size }} className="bg-gray-100 rounded animate-pulse" />;
  return <div dangerouslySetInnerHTML={{ __html: svg }} style={{ width: size, height: size }} />;
}

function BarcodeRenderer({ value, format, size }: { value: string; format: BarcodeFormat; size: "small" | "medium" | "large" }) {
  if (!value) return null;
  const heights: Record<string, number> = { small: 30, medium: 50, large: 60 };
  const qrSizes: Record<string, number> = { small: 55, medium: 80, large: 110 };
  if (format === "QR") return <QRCodeDisplay value={value} size={qrSizes[size]} />;
  return <LinearBarcode value={value} format={format} height={heights[size]} fontSize={size === "small" ? 8 : 10} />;
}

// ── Label components (also used in print) ─────────────────────────────────────

function ProductLabel({ barcode, name, unit, template, format }: {
  barcode: string; name: string; unit?: string; template: LabelTemplate; format: BarcodeFormat;
}) {
  const isSmall = template === "small";
  const isLarge = template === "large";
  return (
    <div className={`barcode-label flex flex-col items-center bg-white border border-gray-300 rounded p-2 print:border-black print:rounded-none print:shadow-none ${isSmall ? "w-[130px]" : isLarge ? "w-[280px]" : "w-[190px]"}`}>
      <div className="text-center leading-tight mb-1">
        <p className={`font-semibold ${isSmall ? "text-[8px]" : "text-[10px]"} line-clamp-2 max-w-full`}>{name}</p>
        {unit && <p className={`text-muted-foreground ${isSmall ? "text-[7px]" : "text-[9px]"}`}>{unit}</p>}
      </div>
      <BarcodeRenderer value={barcode} format={format} size={isSmall ? "small" : isLarge ? "large" : "medium"} />
      <p className={`font-mono mt-0.5 text-center ${isSmall ? "text-[7px]" : "text-[8px]"}`}>{barcode}</p>
    </div>
  );
}

function AssetLabel({ asset, barcodeValue, template }: { asset: Asset; barcodeValue: string; template: LabelTemplate }) {
  if (template === "qr_asset") {
    return (
      <div className="barcode-label flex bg-white border border-gray-300 rounded p-3 gap-3 print:border-black print:rounded-none print:shadow-none" style={{ width: 280 }}>
        <div className="shrink-0">
          <QRCodeDisplay value={barcodeValue} size={80} />
        </div>
        <div className="flex flex-col justify-between text-[9px] leading-tight min-w-0">
          <p className="font-bold text-[11px] leading-tight line-clamp-2">{asset.assetName}</p>
          {asset.faNumber && <p><span className="font-semibold">FA#:</span> {asset.faNumber}</p>}
          {asset.fyNumber && <p><span className="font-semibold">FY#:</span> {asset.fyNumber}</p>}
          {asset.ccNumber && <p><span className="font-semibold">CC#:</span> {asset.ccNumber}</p>}
          {asset.serialNumber && <p><span className="font-semibold">S/N:</span> {asset.serialNumber}</p>}
          {asset.custodianName && <p><span className="font-semibold">Custodian:</span> {asset.custodianName}</p>}
          <Badge variant={asset.status === "active" ? "default" : "secondary"} className="text-[7px] px-1 py-0 w-fit mt-0.5">
            {asset.status}
          </Badge>
        </div>
      </div>
    );
  }
  const isSmall = template === "small";
  const isLarge = template === "large";
  return (
    <div className={`barcode-label flex flex-col items-center bg-white border border-gray-300 rounded p-2 print:border-black print:rounded-none print:shadow-none ${isSmall ? "w-[130px]" : isLarge ? "w-[280px]" : "w-[190px]"}`}>
      <p className={`font-semibold text-center mb-1 leading-tight line-clamp-2 max-w-full ${isSmall ? "text-[8px]" : "text-[10px]"}`}>{asset.assetName}</p>
      <QRCodeDisplay value={barcodeValue} size={isSmall ? 55 : isLarge ? 110 : 80} />
      {asset.faNumber && <p className={`font-mono text-center mt-0.5 ${isSmall ? "text-[7px]" : "text-[8px]"}`}>FA: {asset.faNumber}</p>}
      <p className={`font-mono text-center mt-0.5 ${isSmall ? "text-[7px]" : "text-[8px]"}`}>{barcodeValue}</p>
    </div>
  );
}

// ── Print area ─────────────────────────────────────────────────────────────────

function PrintPreview({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">{title}</p>
        <Button onClick={() => window.print()} size="sm">
          <Printer className="w-4 h-4 mr-1.5" /> Print
        </Button>
      </div>
      <div id="print-area" className="flex flex-wrap gap-3 p-3 bg-muted/30 rounded-lg border min-h-[100px]">
        {children}
      </div>
    </div>
  );
}

// ── Quantity selector ──────────────────────────────────────────────────────────

function QuantitySelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [custom, setCustom] = useState(false);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">Qty per label:</span>
      {PRINT_QUANTITIES.map(q => (
        <Button
          key={q}
          size="sm"
          variant={!custom && value === q ? "default" : "outline"}
          className="h-7 px-2.5 text-xs"
          onClick={() => { setCustom(false); onChange(q); }}
        >
          {q}
        </Button>
      ))}
      <Button
        size="sm"
        variant={custom ? "default" : "outline"}
        className="h-7 px-2.5 text-xs"
        onClick={() => setCustom(true)}
      >
        Custom
      </Button>
      {custom && (
        <Input
          type="number"
          min={1}
          max={500}
          value={value}
          onChange={e => onChange(Math.max(1, parseInt(e.target.value) || 1))}
          className="h-7 w-20 text-xs"
        />
      )}
    </div>
  );
}

// ── Inline barcode status badge ────────────────────────────────────────────────

function BarcodeBadge({ barcode, isDuplicate }: { barcode: string | null; isDuplicate?: boolean }) {
  if (isDuplicate) return <Badge className="text-[9px] px-1 py-0 h-4 bg-red-100 text-red-700 hover:bg-red-100">Duplicate</Badge>;
  if (barcode) return <Badge className="text-[9px] px-1 py-0 h-4 bg-green-100 text-green-700 hover:bg-green-100">Assigned</Badge>;
  return <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-amber-400 text-amber-600">Missing</Badge>;
}

// ── Inline barcode assignment panel ───────────────────────────────────────────

interface AssignPanelState { value: string; checking: boolean; duplicate: BarcodeOwner | null; }

function AssignBarcodePanel({
  entityId, entityName, currentBarcode, entityType, settings,
  onSaved, onClose,
}: {
  entityId: string; entityName: string; currentBarcode: string | null;
  entityType: "product" | "asset";
  settings: BarcodeSettings; onSaved: () => void; onClose: () => void;
}) {
  const { user } = useAuth();
  const [mode, setMode] = useState<"manual" | "camera">("manual");
  const [st, setSt] = useState<AssignPanelState>({ value: "", checking: false, duplicate: null });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "manual") setTimeout(() => inputRef.current?.focus(), 60);
  }, [mode]);

  const setVal = (v: string) => setSt(s => ({ ...s, value: v, duplicate: null }));

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: async (barcode: string) => {
      const bc = barcode.trim();
      if (!bc) throw new Error("Barcode is required");
      const dup = await validateBarcodeUnique(bc, entityId, entityType);
      if (dup) { setSt(s => ({ ...s, duplicate: dup })); throw new Error("duplicate"); }
      if (entityType === "product") await setProductBarcode(entityId, bc, user?.id);
      else await setAssetBarcode(entityId, bc, user?.id ?? null, user?.fullName);
    },
    onSuccess: () => { toast.success("Barcode assigned"); onSaved(); },
    onError: (e: any) => { if (e.message !== "duplicate") toast.error(e.message); },
  });

  const { mutate: autoGen, isPending: generating } = useMutation({
    mutationFn: async () => {
      const bc = entityType === "product"
        ? await generateNextProductBarcode(settings)
        : await generateNextAssetBarcode(settings);
      const dup = await validateBarcodeUnique(bc, entityId, entityType);
      if (dup) throw new Error("Generated barcode conflicts — try again");
      if (entityType === "product") await setProductBarcode(entityId, bc, user?.id);
      else await setAssetBarcode(entityId, bc, user?.id ?? null, user?.fullName);
      return bc;
    },
    onSuccess: (bc) => { toast.success(`Barcode assigned: ${bc}`); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  const { mutate: removeBC, isPending: removing } = useMutation({
    mutationFn: async () => {
      if (entityType === "product") await setProductBarcode(entityId, null, user?.id);
      else await setAssetBarcode(entityId, null, user?.id ?? null, user?.fullName);
    },
    onSuccess: () => { toast.success("Barcode removed"); onSaved(); },
    onError: () => toast.error("Failed to remove"),
  });

  const handleCameraScan = useCallback((code: string) => {
    setVal(code);
    setMode("manual");
  }, []);

  return (
    <div className="mx-3 mb-2 border rounded-lg bg-background shadow-md p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Assign Barcode</p>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}><X className="w-3.5 h-3.5" /></Button>
      </div>

      {currentBarcode && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded text-xs">
          <span className="text-muted-foreground shrink-0">Current:</span>
          <span className="font-mono font-medium flex-1 truncate">{currentBarcode}</span>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive hover:text-destructive text-xs shrink-0" onClick={() => removeBC()} disabled={removing}>
            Remove
          </Button>
        </div>
      )}

      <div className="flex gap-1.5">
        <Button size="sm" variant={mode === "manual" ? "default" : "outline"} className="h-7 flex-1 text-xs" onClick={() => setMode("manual")}>
          <Keyboard className="w-3 h-3 mr-1" /> Manual / USB
        </Button>
        <Button size="sm" variant={mode === "camera" ? "default" : "outline"} className="h-7 flex-1 text-xs" onClick={() => setMode("camera")}>
          <Camera className="w-3 h-3 mr-1" /> Camera
        </Button>
        <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => autoGen()} disabled={generating}>
          <RefreshCw className={`w-3 h-3 mr-1 ${generating ? "animate-spin" : ""}`} /> Auto
        </Button>
      </div>

      {mode === "manual" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={st.value}
              onChange={e => setVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); save(st.value); } }}
              placeholder="Type or scan barcode…"
              className="font-mono h-8 text-sm"
              autoComplete="off"
            />
            <Button size="sm" className="h-8 px-3" onClick={() => save(st.value)} disabled={saving || !st.value.trim()}>
              {saving ? "…" : "Save"}
            </Button>
          </div>
          {st.duplicate && (
            <div className="flex items-start gap-2 p-2 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Barcode already in use</p>
                <p>Assigned to {st.duplicate.type}: <span className="font-bold">{st.duplicate.name}</span></p>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "camera" && (
        <div className="space-y-2">
          <CameraScanner onDetected={handleCameraScan} />
          {st.value && (
            <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <span className="font-mono flex-1 truncate">{st.value}</span>
              <Button size="sm" className="h-7 px-2 text-xs" onClick={() => save(st.value)} disabled={saving}>Save</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sequential Scanner Mode ───────────────────────────────────────────────────

function SequentialScanMode({
  items, entityType, settings, userId, userName, onClose, onRefresh,
}: {
  items: Array<{ id: string; name: string; barcode: string | null }>;
  entityType: "product" | "asset";
  settings: BarcodeSettings;
  userId?: string;
  userName?: string | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [scanned, setScanned] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, [idx]);

  const current = items[idx];
  const isDone = idx >= items.length;

  const { mutate: assign, isPending } = useMutation({
    mutationFn: async (barcode: string) => {
      const bc = barcode.trim();
      if (!bc) throw new Error("Barcode required");
      const dup = await validateBarcodeUnique(bc, current.id, entityType);
      if (dup) throw new Error(`Already assigned to ${dup.type}: ${dup.name}`);
      if (entityType === "product") await setProductBarcode(current.id, bc, userId);
      else await setAssetBarcode(current.id, bc, userId ?? null, userName);
    },
    onSuccess: () => {
      toast.success(`${current.name}: barcode saved`);
      setScanned("");
      onRefresh();
      setIdx(i => i + 1);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleScan = useCallback((code: string) => {
    setScanned(code);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  if (isDone) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <CheckCircle2 className="w-12 h-12 text-green-500" />
        <div className="text-center">
          <p className="font-semibold text-lg">All done!</p>
          <p className="text-sm text-muted-foreground">{items.length} items processed</p>
        </div>
        <Button onClick={onClose}>Close</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Item {idx + 1} of {items.length}</p>
          <p className="font-semibold text-base">{current.name}</p>
          {current.barcode && <p className="text-xs text-muted-foreground font-mono">Current: {current.barcode}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
      </div>

      <div className="w-full bg-secondary rounded-full h-1.5">
        <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${(idx / items.length) * 100}%` }} />
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <p className="text-sm font-medium">Scan or type the barcode for this item:</p>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={scanned}
              onChange={e => setScanned(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); assign(scanned); } }}
              placeholder="Scan or type barcode…"
              className="font-mono"
              autoComplete="off"
            />
            <Button onClick={() => assign(scanned)} disabled={isPending || !scanned.trim()}>
              {isPending ? "…" : "Next"} <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setScanned(""); setIdx(i => i + 1); }}>
            Skip this item
          </Button>
        </CardContent>
      </Card>

      <div className="text-center">
        <p className="text-xs text-muted-foreground">USB/Bluetooth scanners auto-detected · or use camera below</p>
      </div>
      <CameraScanner onDetected={handleScan} />
    </div>
  );
}

// ── Products tab ───────────────────────────────────────────────────────────────

function ProductsTab({ settings }: { settings: BarcodeSettings }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assignId, setAssignId] = useState<string | null>(null);
  const [seqMode, setSeqMode] = useState(false);
  const [barcodeFormat, setBarcodeFormat] = useState<BarcodeFormat>(settings.productBarcodeType);
  const [template, setTemplate] = useState<LabelTemplate>(settings.defaultTemplate === "qr_asset" ? "medium" : settings.defaultTemplate);
  const [qty, setQty] = useState(settings.defaultQuantity);
  const [showPrint, setShowPrint] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["products", search],
    queryFn: () => listProducts(search),
  });

  const { data: units = [] } = useQuery({
    queryKey: ["units", expandedId],
    queryFn: () => expandedId ? listProductUnits(expandedId) : Promise.resolve([]),
    enabled: !!expandedId,
  });

  // Build duplicate barcode set from the loaded product list
  const duplicateBarcodes = new Set<string>();
  const bcCount = new Map<string, number>();
  for (const p of products) {
    if (p.barcode) bcCount.set(p.barcode, (bcCount.get(p.barcode) ?? 0) + 1);
  }
  for (const [bc, n] of bcCount) { if (n > 1) duplicateBarcodes.add(bc); }

  const toggleProduct = (id: string) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleAll = () => {
    if (selected.size === products.length) setSelected(new Set());
    else setSelected(new Set(products.map(p => p.id)));
  };

  const selectedProducts = products.filter(p => selected.has(p.id));
  const printItems: { barcode: string; name: string }[] = [];
  for (const p of selectedProducts) {
    const bc = p.barcode?.trim();
    if (bc) for (let i = 0; i < qty; i++) printItems.push({ barcode: bc, name: p.productName });
  }
  const noBarcode = selectedProducts.filter(p => !p.barcode?.trim());

  const refresh = () => qc.invalidateQueries({ queryKey: ["products"] });

  if (seqMode) {
    const seqItems = (selected.size > 0 ? selectedProducts : products).map(p => ({
      id: p.id, name: p.productName, barcode: p.barcode,
    }));
    return (
      <SequentialScanMode
        items={seqItems}
        entityType="product"
        settings={settings}
        userId={user?.id}
        userName={user?.fullName}
        onClose={() => setSeqMode(false)}
        onRefresh={refresh}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <Label className="text-xs mb-1 block">Search Products</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSeqMode(true)} title="Scan barcodes for multiple products sequentially">
          <ScanLine className="w-3.5 h-3.5 mr-1.5" /> Sequential Scan
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowPrint(v => !v)}>
          <Printer className="w-3.5 h-3.5 mr-1.5" /> {showPrint ? "Hide Print" : "Print Labels"}
        </Button>
      </div>

      {/* Print settings (collapsible) */}
      {showPrint && (
        <Card className="border-dashed">
          <CardContent className="pt-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-40">
                <Label className="text-xs mb-1 block">Barcode Type</Label>
                <Select value={barcodeFormat} onValueChange={v => setBarcodeFormat(v as BarcodeFormat)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BARCODE_FORMAT_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-40">
                <Label className="text-xs mb-1 block">Label Size</Label>
                <Select value={template} onValueChange={v => setTemplate(v as LabelTemplate)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(LABEL_TEMPLATES) as [LabelTemplate, { name: string; description: string }][])
                      .filter(([k]) => k !== "qr_asset")
                      .map(([k, v]) => <SelectItem key={k} value={k}>{v.name} ({v.description})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selected.size > 0 && (
              <>
                <QuantitySelector value={qty} onChange={setQty} />
                {noBarcode.length > 0 && (
                  <p className="text-xs text-amber-600">
                    <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                    {noBarcode.length} selected product(s) have no barcode — assign barcodes first.
                  </p>
                )}
                {printItems.length > 0 ? (
                  <PrintPreview title={`${printItems.length} label(s) ready`}>
                    {printItems.map((item, i) => <ProductLabel key={i} barcode={item.barcode} name={item.name} template={template} format={barcodeFormat} />)}
                  </PrintPreview>
                ) : (
                  <p className="text-sm text-muted-foreground">Select products with barcodes to print.</p>
                )}
              </>
            )}
            {selected.size === 0 && <p className="text-sm text-muted-foreground">Select products below to print their labels.</p>}
          </CardContent>
        </Card>
      )}

      {/* Product list */}
      <div className="rounded-md border overflow-hidden">
        <div className="flex items-center px-3 py-2 bg-muted/50 border-b gap-2">
          <Checkbox checked={selected.size === products.length && products.length > 0} onCheckedChange={toggleAll} />
          <span className="text-xs text-muted-foreground flex-1">{selected.size} of {products.length} selected</span>
          {selected.size > 0 && (
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setSelected(new Set())}>Clear</Button>
          )}
        </div>
        <div className="max-h-[28rem] overflow-y-auto divide-y">
          {products.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">No products found</p>}
          {products.map(p => {
            const isDup = !!(p.barcode && duplicateBarcodes.has(p.barcode));
            const isAssigning = assignId === p.id;
            return (
              <div key={p.id}>
                <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/20">
                  <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleProduct(p.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium truncate">{p.productName}</p>
                      {p.category && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{p.category}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {p.barcode && <span className="text-xs font-mono text-muted-foreground">{p.barcode}</span>}
                      <BarcodeBadge barcode={p.barcode} isDuplicate={isDup} />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isAssigning ? "default" : "outline"}
                    className="h-7 text-xs px-2 shrink-0"
                    onClick={() => setAssignId(isAssigning ? null : p.id)}
                  >
                    <QrCode className="w-3 h-3 mr-1" /> {isAssigning ? "Close" : "Assign"}
                  </Button>
                  <button
                    onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    className="text-muted-foreground hover:text-foreground p-1 shrink-0"
                  >
                    <ChevronRight className={`w-4 h-4 transition-transform ${expandedId === p.id ? "rotate-90" : ""}`} />
                  </button>
                </div>

                {isAssigning && (
                  <AssignBarcodePanel
                    entityId={p.id}
                    entityName={p.productName}
                    currentBarcode={p.barcode}
                    entityType="product"
                    settings={settings}
                    onSaved={() => { setAssignId(null); refresh(); }}
                    onClose={() => setAssignId(null)}
                  />
                )}

                {expandedId === p.id && units.length > 0 && (
                  <div className="pl-10 pr-3 pb-2 bg-muted/20 divide-y divide-border/50">
                    {units.map(u => (
                      <div key={u.id} className="flex items-center gap-2 py-1.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{u.unitName}</p>
                          {u.barcode ? (
                            <span className="text-[10px] font-mono text-muted-foreground">{u.barcode}</span>
                          ) : (
                            <span className="text-[10px] text-amber-600">No barcode</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Assets tab ─────────────────────────────────────────────────────────────────

function AssetsTab({ settings }: { settings: BarcodeSettings }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignId, setAssignId] = useState<string | null>(null);
  const [seqMode, setSeqMode] = useState(false);
  const [template, setTemplate] = useState<LabelTemplate>("qr_asset");
  const [qty, setQty] = useState(settings.defaultQuantity);
  const [showPrint, setShowPrint] = useState(false);

  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: listAssets });

  const filtered = assets.filter(a =>
    !search ||
    a.assetName.toLowerCase().includes(search.toLowerCase()) ||
    a.faNumber?.toLowerCase().includes(search.toLowerCase()) ||
    a.serialNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const duplicateBarcodes = new Set<string>();
  const bcCount = new Map<string, number>();
  for (const a of assets) {
    if (a.barcode) bcCount.set(a.barcode, (bcCount.get(a.barcode) ?? 0) + 1);
  }
  for (const [bc, n] of bcCount) { if (n > 1) duplicateBarcodes.add(bc); }

  const toggleAsset = (id: string) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(a => a.id)));
  };

  const selectedAssets = filtered.filter(a => selected.has(a.id));
  const getBarcodeValue = (a: Asset) => a.barcode?.trim() || a.faNumber || a.serialNumber || a.id;

  const printItems = selectedAssets.flatMap(a => {
    const bv = getBarcodeValue(a);
    return Array.from({ length: qty }, () => ({ asset: a, barcodeValue: bv }));
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["assets"] });

  if (seqMode) {
    const seqItems = (selected.size > 0 ? selectedAssets : filtered).map(a => ({
      id: a.id, name: a.assetName, barcode: a.barcode,
    }));
    return (
      <SequentialScanMode
        items={seqItems}
        entityType="asset"
        settings={settings}
        userId={user?.id}
        userName={user?.fullName}
        onClose={() => setSeqMode(false)}
        onRefresh={refresh}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <Label className="text-xs mb-1 block">Search Assets</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Name, FA#, serial…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSeqMode(true)}>
          <ScanLine className="w-3.5 h-3.5 mr-1.5" /> Sequential Scan
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowPrint(v => !v)}>
          <Printer className="w-3.5 h-3.5 mr-1.5" /> {showPrint ? "Hide Print" : "Print Labels"}
        </Button>
      </div>

      {showPrint && (
        <Card className="border-dashed">
          <CardContent className="pt-4 space-y-3">
            <div>
              <Label className="text-xs mb-1 block">Label Template</Label>
              <Select value={template} onValueChange={v => setTemplate(v as LabelTemplate)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(LABEL_TEMPLATES) as [LabelTemplate, { name: string; description: string }][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.name} ({v.description})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selected.size > 0 ? (
              <>
                <QuantitySelector value={qty} onChange={setQty} />
                <PrintPreview title={`${printItems.length} label(s) ready`}>
                  {printItems.map((item, i) => <AssetLabel key={i} asset={item.asset} barcodeValue={item.barcodeValue} template={template} />)}
                </PrintPreview>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select assets below to print their labels.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="rounded-md border overflow-hidden">
        <div className="flex items-center px-3 py-2 bg-muted/50 border-b gap-2">
          <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
          <span className="text-xs text-muted-foreground flex-1">{selected.size} of {filtered.length} selected</span>
          {selected.size > 0 && (
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setSelected(new Set())}>Clear</Button>
          )}
        </div>
        <div className="max-h-[28rem] overflow-y-auto divide-y">
          {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">No assets found</p>}
          {filtered.map(a => {
            const isDup = !!(a.barcode && duplicateBarcodes.has(a.barcode));
            const isAssigning = assignId === a.id;
            return (
              <div key={a.id}>
                <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/20">
                  <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleAsset(a.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium truncate">{a.assetName}</p>
                      <Badge variant={a.status === "active" ? "default" : "secondary"} className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                        {a.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {a.faNumber && <span className="text-[10px] text-muted-foreground">FA: {a.faNumber}</span>}
                      {a.serialNumber && <span className="text-[10px] text-muted-foreground">S/N: {a.serialNumber}</span>}
                      {a.custodianName && <span className="text-[10px] text-muted-foreground">👤 {a.custodianName}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {a.barcode && <span className="text-[10px] font-mono text-muted-foreground">{a.barcode}</span>}
                      <BarcodeBadge barcode={a.barcode} isDuplicate={isDup} />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isAssigning ? "default" : "outline"}
                    className="h-7 text-xs px-2 shrink-0"
                    onClick={() => setAssignId(isAssigning ? null : a.id)}
                  >
                    <QrCode className="w-3 h-3 mr-1" /> {isAssigning ? "Close" : "Assign"}
                  </Button>
                </div>

                {isAssigning && (
                  <AssignBarcodePanel
                    entityId={a.id}
                    entityName={a.assetName}
                    currentBarcode={a.barcode}
                    entityType="asset"
                    settings={settings}
                    onSaved={() => { setAssignId(null); refresh(); }}
                    onClose={() => setAssignId(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Import Tab ─────────────────────────────────────────────────────────────────

function ImportTab({ settings }: { settings: BarcodeSettings }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [csvText, setCsvText] = useState("");
  const [entityType, setEntityType] = useState<"product" | "asset">("product");
  const fileRef = useRef<HTMLInputElement>(null);

  interface ImportRow { identifier: string; barcode: string; matched?: string; conflict?: string; status?: "ok" | "conflict" | "not_found"; }
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parsed, setParsed] = useState(false);
  const [importing, setImporting] = useState(false);

  const { data: products = [] } = useQuery({ queryKey: ["products", ""], queryFn: () => listProducts("") });
  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: listAssets });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => setCsvText((ev.target?.result as string) ?? "");
    reader.readAsText(f);
  };

  const parseCSV = () => {
    const lines = csvText.trim().split("\n").filter(Boolean);
    const parsed: ImportRow[] = [];
    for (const line of lines) {
      const parts = line.split(/,|\t/).map(p => p.trim().replace(/^["']|["']$/g, ""));
      if (parts.length < 2) continue;
      const [identifier, barcode] = parts;
      if (!identifier || !barcode) continue;

      const row: ImportRow = { identifier, barcode };
      const idLower = identifier.toLowerCase();

      if (entityType === "product") {
        const match = products.find(p =>
          p.productName.toLowerCase() === idLower ||
          p.productCode.toLowerCase() === idLower ||
          p.barcode === identifier
        );
        if (match) {
          row.matched = match.productName;
          if (match.barcode && match.barcode !== barcode) row.conflict = `Has: ${match.barcode}`;
          row.status = row.conflict ? "conflict" : "ok";
        } else {
          row.status = "not_found";
        }
      } else {
        const match = assets.find(a =>
          a.assetName.toLowerCase() === idLower ||
          a.faNumber?.toLowerCase() === idLower ||
          a.serialNumber?.toLowerCase() === idLower
        );
        if (match) {
          row.matched = match.assetName;
          if (match.barcode && match.barcode !== barcode) row.conflict = `Has: ${match.barcode}`;
          row.status = row.conflict ? "conflict" : "ok";
        } else {
          row.status = "not_found";
        }
      }

      parsed.push(row);
    }
    setRows(parsed);
    setParsed(true);
  };

  const runImport = async (overwriteConflicts: boolean) => {
    setImporting(true);
    let ok = 0; let skipped = 0; let errors = 0;
    try {
      for (const row of rows) {
        if (row.status === "not_found") { skipped++; continue; }
        if (row.status === "conflict" && !overwriteConflicts) { skipped++; continue; }
        try {
          // Find the record again
          if (entityType === "product") {
            const match = products.find(p => p.productName.toLowerCase() === row.identifier.toLowerCase() || p.productCode.toLowerCase() === row.identifier.toLowerCase());
            if (match) { await setProductBarcode(match.id, row.barcode, user?.id); ok++; }
          } else {
            const match = assets.find(a => a.assetName.toLowerCase() === row.identifier.toLowerCase() || a.faNumber?.toLowerCase() === row.identifier.toLowerCase());
            if (match) { await setAssetBarcode(match.id, row.barcode, user?.id ?? null, user?.fullName); ok++; }
          }
        } catch { errors++; }
      }
      toast.success(`Import complete: ${ok} updated, ${skipped} skipped, ${errors} errors`);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      setRows([]); setCsvText(""); setParsed(false);
    } finally { setImporting(false); }
  };

  return (
    <div className="space-y-5 max-w-xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Upload className="w-4 h-4" /> Import Barcodes from CSV
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs mb-1.5 block">Target</Label>
            <div className="flex gap-2">
              <Button size="sm" variant={entityType === "product" ? "default" : "outline"} onClick={() => { setEntityType("product"); setParsed(false); }}>
                <Package className="w-3.5 h-3.5 mr-1.5" /> Products
              </Button>
              <Button size="sm" variant={entityType === "asset" ? "default" : "outline"} onClick={() => { setEntityType("asset"); setParsed(false); }}>
                <Briefcase className="w-3.5 h-3.5 mr-1.5" /> Assets
              </Button>
            </div>
          </div>

          <div className="p-3 bg-muted/40 rounded text-xs space-y-1 text-muted-foreground">
            <p className="font-medium text-foreground">CSV format (no header required):</p>
            <p>Column 1: {entityType === "product" ? "Product name or product code" : "Asset name or FA number"}</p>
            <p>Column 2: Barcode value</p>
            <p>Example: <span className="font-mono">Amoxicillin 500mg, PRD-000001</span></p>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Upload file or paste CSV text</Label>
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFile} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="mb-2">
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Choose File
            </Button>
            <textarea
              className="w-full h-32 text-xs font-mono p-2 border rounded resize-none bg-background"
              placeholder={"Product Name,BARCODE\nAnother Product,BARCODE2"}
              value={csvText}
              onChange={e => { setCsvText(e.target.value); setParsed(false); }}
            />
          </div>

          <Button onClick={parseCSV} disabled={!csvText.trim()} className="w-full">
            <FileText className="w-4 h-4 mr-2" /> Preview Import
          </Button>
        </CardContent>
      </Card>

      {parsed && rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Preview — {rows.length} rows</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-64 overflow-y-auto">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.identifier}</p>
                    {r.matched && <p className="text-muted-foreground truncate">→ {r.matched}</p>}
                    {r.conflict && <p className="text-amber-600">{r.conflict}</p>}
                  </div>
                  <span className="font-mono text-muted-foreground shrink-0">{r.barcode}</span>
                  <Badge
                    variant={r.status === "ok" ? "default" : r.status === "conflict" ? "outline" : "secondary"}
                    className={`text-[9px] px-1.5 py-0 h-4 shrink-0 ${r.status === "ok" ? "bg-green-100 text-green-700 hover:bg-green-100" : r.status === "conflict" ? "border-amber-400 text-amber-600" : ""}`}
                  >
                    {r.status === "ok" ? "Ready" : r.status === "conflict" ? "Conflict" : "Not found"}
                  </Badge>
                </div>
              ))}
            </div>
            <div className="p-4 space-y-2 border-t">
              <div className="flex gap-2 flex-wrap text-xs text-muted-foreground">
                <span className="text-green-700 font-medium">{rows.filter(r => r.status === "ok").length} ready</span>
                <span className="text-amber-600 font-medium">{rows.filter(r => r.status === "conflict").length} conflicts</span>
                <span>{rows.filter(r => r.status === "not_found").length} not found</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => runImport(false)} disabled={importing} className="flex-1">
                  Import (skip conflicts)
                </Button>
                <Button size="sm" variant="outline" onClick={() => runImport(true)} disabled={importing} className="flex-1">
                  Import (overwrite all)
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {parsed && rows.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No valid rows found in the CSV.</p>
      )}
    </div>
  );
}

// ── Reports Tab ────────────────────────────────────────────────────────────────

function ReportsTab({ settings }: { settings: BarcodeSettings }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [generatingAll, setGeneratingAll] = useState(false);

  const { data: products = [] } = useQuery({ queryKey: ["products", ""], queryFn: () => listProducts("") });
  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: listAssets });

  const { data: duplicates } = useQuery({
    queryKey: ["barcode_duplicates"],
    queryFn: detectAllDuplicates,
    staleTime: 30000,
  });

  const missingProducts = products.filter(p => !p.barcode?.trim());
  const missingAssets = assets.filter(a => !a.barcode?.trim());

  const generateAllProductBarcodes = async () => {
    setGeneratingAll(true);
    let ok = 0;
    try {
      for (const p of missingProducts) {
        const bc = await generateNextProductBarcode(settings);
        await setProductBarcode(p.id, bc, user?.id);
        ok++;
      }
      toast.success(`Generated ${ok} barcodes`);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["barcode_duplicates"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGeneratingAll(false);
    }
  };

  const generateAllAssetBarcodes = async () => {
    setGeneratingAll(true);
    let ok = 0;
    try {
      for (const a of missingAssets) {
        const bc = await generateNextAssetBarcode(settings);
        await setAssetBarcode(a.id, bc, user?.id ?? null, user?.fullName);
        ok++;
      }
      toast.success(`Generated ${ok} barcodes`);
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["barcode_duplicates"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGeneratingAll(false);
    }
  };

  const dupArray = duplicates ? [...duplicates.entries()] : [];

  return (
    <div className="space-y-5">
      {/* Missing Products */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-500" />
              Products Missing Barcode
              <Badge variant="outline" className="ml-1">{missingProducts.length}</Badge>
            </CardTitle>
            {missingProducts.length > 0 && (
              <Button size="sm" variant="outline" onClick={generateAllProductBarcodes} disabled={generatingAll}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${generatingAll ? "animate-spin" : ""}`} />
                Generate All
              </Button>
            )}
          </div>
        </CardHeader>
        {missingProducts.length > 0 ? (
          <CardContent className="p-0">
            <div className="divide-y max-h-48 overflow-y-auto">
              {missingProducts.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.productName}</p>
                    {p.category && <p className="text-muted-foreground">{p.category}</p>}
                  </div>
                  <Badge variant="outline" className="text-[9px] border-amber-400 text-amber-600">Missing</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        ) : (
          <CardContent>
            <p className="text-sm text-green-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> All products have barcodes</p>
          </CardContent>
        )}
      </Card>

      {/* Missing Assets */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-amber-500" />
              Assets Missing Barcode
              <Badge variant="outline" className="ml-1">{missingAssets.length}</Badge>
            </CardTitle>
            {missingAssets.length > 0 && (
              <Button size="sm" variant="outline" onClick={generateAllAssetBarcodes} disabled={generatingAll}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${generatingAll ? "animate-spin" : ""}`} />
                Generate All
              </Button>
            )}
          </div>
        </CardHeader>
        {missingAssets.length > 0 ? (
          <CardContent className="p-0">
            <div className="divide-y max-h-48 overflow-y-auto">
              {missingAssets.map(a => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{a.assetName}</p>
                    {a.faNumber && <p className="text-muted-foreground">FA: {a.faNumber}</p>}
                  </div>
                  <Badge variant="outline" className="text-[9px] border-amber-400 text-amber-600">Missing</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        ) : (
          <CardContent>
            <p className="text-sm text-green-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> All assets have barcodes</p>
          </CardContent>
        )}
      </Card>

      {/* Duplicate Barcodes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            Duplicate Barcodes
            <Badge variant="outline" className="ml-1">{dupArray.length}</Badge>
          </CardTitle>
        </CardHeader>
        {dupArray.length > 0 ? (
          <CardContent className="p-0">
            <div className="divide-y max-h-64 overflow-y-auto">
              {dupArray.map(([bc, owners]) => (
                <div key={bc} className="px-4 py-2.5 space-y-1.5">
                  <p className="text-xs font-mono font-semibold text-red-600">{bc}</p>
                  {owners.map(o => (
                    <div key={o.id} className="flex items-center gap-2 text-xs pl-2">
                      {o.type === "product" ? <Package className="w-3 h-3 text-muted-foreground" /> : <Briefcase className="w-3 h-3 text-muted-foreground" />}
                      <span className="text-muted-foreground capitalize">{o.type}:</span>
                      <span className="font-medium truncate">{o.name}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        ) : (
          <CardContent>
            <p className="text-sm text-green-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> No duplicate barcodes found</p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// ── Camera scanner component ───────────────────────────────────────────────────
// KEY FIX: html5-qrcode needs its container div to be VISIBLE in the DOM
// (with real dimensions) before scanner.start() is called.
// We trigger initialization via a useEffect that fires AFTER React commits
// the DOM update that makes the container visible — using state "loading" as
// the trigger so the div is rendered before the scanner mounts into it.

type CameraState = "idle" | "loading" | "active" | "denied" | "unavailable";
interface CameraInfo { id: string; label: string; }

const CAMERA_CONTAINER_ID = "hl5qr-viewfinder";

function CameraScanner({ onDetected }: { onDetected: (code: string) => void }) {
  const [state, setState] = useState<CameraState>("idle");
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [activeCameraId, setActiveCameraId] = useState("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [flashCode, setFlashCode] = useState("");

  const scannerRef = useRef<any>(null);
  // Use refs to avoid stale closures in the scan callback
  const lastCodeRef = useRef("");
  const pendingCamRef = useRef("environment");
  const onDetectedRef = useRef(onDetected);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  const doStop = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch { /* ignore cleanup errors */ }
      scannerRef.current = null;
    }
    lastCodeRef.current = "";
    setFlashCode("");
    setTorchOn(false);
  }, []);

  // ⚑ MAIN FIX: useEffect fires after React commits — the container div is
  // in the DOM and visible when this runs, so html5-qrcode can mount correctly.
  useEffect(() => {
    if (state !== "loading") return;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;

        // Enumerate available cameras (once per session)
        if (cameras.length === 0) {
          try {
            const devs = await Html5Qrcode.getCameras();
            if (!cancelled && devs.length > 0)
              setCameras(devs.map(d => ({ id: d.id, label: d.label || `Camera ${d.id.slice(0, 6)}` })));
          } catch { /* camera list is optional */ }
        }

        // Tear down any previous instance
        await doStop();
        if (cancelled) return;

        const scanner = new Html5Qrcode(CAMERA_CONTAINER_ID, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ],
        });
        scannerRef.current = scanner;

        const camId = pendingCamRef.current;
        const constraint = camId === "environment" || camId === "user"
          ? { facingMode: camId }
          : { deviceId: { exact: camId } };

        await scanner.start(
          constraint,
          {
            fps: 15,
            qrbox: (w: number, h: number) => {
              const size = Math.round(Math.min(w, h) * 0.72);
              return { width: size, height: Math.round(size * 0.55) };
            },
            disableFlip: false,
          },
          (code: string) => {
            // Ref-based dedupe — no stale closure risk
            if (code === lastCodeRef.current) return;
            lastCodeRef.current = code;
            setFlashCode(code);
            onDetectedRef.current(code);
            setTimeout(() => { lastCodeRef.current = ""; setFlashCode(""); }, 2500);
          },
          () => { /* per-frame failure: ignore */ }
        );

        if (!cancelled) setState("active");
      } catch (err: any) {
        if (cancelled) return;
        scannerRef.current = null;
        const msg = String(err?.message ?? "").toLowerCase();
        if (msg.includes("permission") || msg.includes("denied") || msg.includes("notallowed"))
          setState("denied");
        else
          setState("unavailable");
        console.warn("[CameraScanner]", err);
      }
    })();

    return () => { cancelled = true; };
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => () => { doStop(); setState("idle"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCamera = (camId = "environment") => {
    pendingCamRef.current = camId;
    setActiveCameraId(camId);
    setState("loading"); // triggers the useEffect above
  };

  const stopCamera = async () => { await doStop(); setState("idle"); };

  const switchCamera = async () => {
    if (cameras.length < 2) return;
    const idx = cameras.findIndex(c => c.id === activeCameraId);
    const next = cameras[(idx + 1) % cameras.length];
    openCamera(next.id);
  };

  const toggleTorch = async () => {
    if (!scannerRef.current?.isScanning) return;
    try {
      await scannerRef.current.applyVideoConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(t => !t);
    } catch { toast.error("Flash not supported on this device"); }
  };

  const isViewfinderVisible = state === "loading" || state === "active";

  return (
    <div className="space-y-3">
      {/* Idle */}
      {state === "idle" && (
        <button
          onClick={() => openCamera("environment")}
          className="w-full flex flex-col items-center justify-center gap-3 h-52 rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer"
        >
          <div className="p-4 rounded-full bg-primary/10">
            <Camera className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-medium text-sm">Tap to open camera</p>
            <p className="text-xs text-muted-foreground mt-0.5">QR Code · Code 128 · Code 39 · EAN · UPC</p>
          </div>
        </button>
      )}

      {/* Initializing */}
      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Initializing camera…
        </div>
      )}

      {/* Permission denied */}
      {state === "denied" && (
        <div className="flex flex-col items-center justify-center h-44 gap-3 rounded-xl bg-destructive/5 border border-destructive/20 px-4">
          <CameraOff className="w-8 h-8 text-destructive/60" />
          <div className="text-center">
            <p className="font-medium text-sm text-destructive">Camera permission denied</p>
            <p className="text-xs text-muted-foreground mt-1">
              Open your browser settings → allow camera for this site, then tap Try Again.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => openCamera("environment")}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Try Again
          </Button>
        </div>
      )}

      {/* No camera / error */}
      {state === "unavailable" && (
        <div className="flex flex-col items-center justify-center h-44 gap-3 rounded-xl bg-muted/30 border px-4">
          <CameraOff className="w-8 h-8 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium text-sm">Camera not available</p>
            <p className="text-xs text-muted-foreground mt-1">
              No camera detected or browser blocked access. Try again, or use the keyboard scanner below.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => openCamera("environment")}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Try Again
          </Button>
        </div>
      )}

      {/* Viewfinder — stays mounted whenever camera is loading or active.
          IMPORTANT: must NOT use display:none while camera is initializing —
          html5-qrcode needs the element to exist with real dimensions. */}
      <div
        style={isViewfinderVisible
          ? undefined
          : { position: "fixed", top: -9999, left: -9999, width: 1, height: 1, overflow: "hidden" }
        }
      >
        <div className={state === "active" ? "relative rounded-xl overflow-hidden border" : "rounded-xl overflow-hidden"}>
          {/* html5-qrcode mounts its video + canvas into this div */}
          <div id={CAMERA_CONTAINER_ID} className="w-full" style={{ minHeight: isViewfinderVisible ? 240 : 1 }} />

          {state === "active" && (
            <>
              {/* Controls bar */}
              <div className="absolute bottom-0 inset-x-0 flex items-center justify-between px-3 py-2 bg-gradient-to-t from-black/60 to-transparent">
                <Button size="sm" variant="ghost" className="text-white hover:bg-white/20 h-8 px-2" onClick={toggleTorch}>
                  {torchOn ? <ZapOff className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                  <span className="text-xs ml-1">{torchOn ? "Flash Off" : "Flash"}</span>
                </Button>
                {cameras.length > 1 && (
                  <Button size="sm" variant="ghost" className="text-white hover:bg-white/20 h-8 px-2" onClick={switchCamera}>
                    <SwitchCamera className="w-4 h-4" />
                    <span className="text-xs ml-1">Flip</span>
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-white hover:bg-white/20 h-8 px-2" onClick={stopCamera}>
                  <CameraOff className="w-4 h-4" />
                  <span className="text-xs ml-1">Stop</span>
                </Button>
              </div>
              {/* Scan success flash */}
              {flashCode && (
                <div className="absolute top-2 inset-x-2 flex items-center gap-2 bg-green-600/90 text-white rounded-lg px-3 py-2 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="font-mono truncate">{flashCode}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Scanner tab ────────────────────────────────────────────────────────────────

function ScannerTab() {
  const [scanInput, setScanInput] = useState("");
  const [result, setResult] = useState<{ type: "product" | "asset" | "not_found"; data?: any; code: string } | null>(null);
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [continuousMode, setContinuousMode] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastKeyTime = useRef<number>(0);
  const bufferRef = useRef<string>("");
  const scanIdRef = useRef(0);

  const { data: products = [] } = useQuery({ queryKey: ["products", ""], queryFn: () => listProducts("") });
  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: () => listAssets() });

  const processBarcode = useCallback((code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setScanInput("");

    const product = products.find(p => p.barcode === trimmed);
    if (product) {
      const rec: ScanRecord = { id: ++scanIdRef.current, code: trimmed, time: new Date(), resultType: "product", name: product.productName };
      setResult({ type: "product", data: product, code: trimmed });
      setHistory(h => [rec, ...h].slice(0, 20));
      return;
    }

    const asset = assets.find(a =>
      (a as any).barcode === trimmed ||
      a.faNumber === trimmed ||
      a.serialNumber === trimmed ||
      a.ccNumber === trimmed
    );
    if (asset) {
      const rec: ScanRecord = { id: ++scanIdRef.current, code: trimmed, time: new Date(), resultType: "asset", name: asset.assetName };
      setResult({ type: "asset", data: asset, code: trimmed });
      setHistory(h => [rec, ...h].slice(0, 20));
      return;
    }

    const rec: ScanRecord = { id: ++scanIdRef.current, code: trimmed, time: new Date(), resultType: "not_found" };
    setResult({ type: "not_found", code: trimmed });
    setHistory(h => [rec, ...h].slice(0, 20));
  }, [products, assets]);

  // Global keyboard scanner: fast successive keystrokes (<50 ms) + Enter
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "textarea") return;
      if (tag === "input" && (e.target as HTMLInputElement) !== inputRef.current) return;

      const now = Date.now();
      const gap = now - lastKeyTime.current;
      lastKeyTime.current = now;

      if (e.key === "Enter") {
        const buf = bufferRef.current;
        bufferRef.current = "";
        if (buf.length > 2) { processBarcode(buf); return; }
        // Also handle the manual input field
        if (scanInput.trim()) processBarcode(scanInput);
        return;
      }
      if (e.key.length === 1) {
        bufferRef.current = gap < 50 ? bufferRef.current + e.key : e.key;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [processBarcode, scanInput]);

  // Auto-focus the manual input on mount
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const resultTypeColor = result?.type === "product" ? "bg-blue-50"
    : result?.type === "asset" ? "bg-green-50" : "bg-amber-50";

  return (
    <div className="space-y-5 max-w-xl">
      {/* Scan mode toggle */}
      <div className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
        <div>
          <p className="text-sm font-medium">{continuousMode ? "Continuous Scan" : "Single Scan"}</p>
          <p className="text-xs text-muted-foreground">
            {continuousMode ? "Camera keeps scanning after each detection" : "Camera stops after first scan"}
          </p>
        </div>
        <Switch checked={continuousMode} onCheckedChange={setContinuousMode} />
      </div>

      {/* Camera scanner */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Camera className="w-4 h-4" /> Camera Scanner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CameraScanner onDetected={processBarcode} />
        </CardContent>
      </Card>

      {/* Keyboard / manual scanner */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Keyboard className="w-4 h-4" /> Keyboard Scanner / Manual
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            USB/Bluetooth scanners auto-detect — just scan while this tab is open. No mouse click needed.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                className="pl-9 font-mono"
                placeholder="Scan or type barcode…"
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); processBarcode(scanInput); } }}
                data-testid="scanner-input"
                autoComplete="off"
              />
            </div>
            <Button onClick={() => processBarcode(scanInput)} disabled={!scanInput.trim()}>
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Latest result */}
      {result && (
        <Card className="border-l-4" style={{ borderLeftColor: result.type === "product" ? "#3b82f6" : result.type === "asset" ? "#22c55e" : "#f59e0b" }}>
          <CardContent className="pt-4">
            {result.type === "not_found" && (
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-50 rounded shrink-0">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Barcode Not Found</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    No product or asset matched <span className="font-mono">{result.code}</span>
                  </p>
                </div>
              </div>
            )}

            {result.type === "product" && result.data && (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-50 rounded shrink-0">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Product</p>
                    <p className="font-semibold truncate">{result.data.productName}</p>
                    <p className="text-xs font-mono text-muted-foreground">{result.data.barcode}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {result.data.category && <Badge variant="secondary" className="text-xs">{result.data.category}</Badge>}
                      {result.data.unit && <Badge variant="outline" className="text-xs">{result.data.unit}</Badge>}
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" asChild>
                    <a href={`#/products/${result.data.id}`}>
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> View Product
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href="#/inventory">Inventory</a>
                  </Button>
                </div>
              </div>
            )}

            {result.type === "asset" && result.data && (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-50 rounded shrink-0">
                    <Briefcase className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Asset</p>
                    <p className="font-semibold truncate">{result.data.assetName}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
                      {result.data.faNumber && <p><span className="font-medium">FA#</span> {result.data.faNumber}</p>}
                      {result.data.fyNumber && <p><span className="font-medium">FY#</span> {result.data.fyNumber}</p>}
                      {result.data.serialNumber && <p><span className="font-medium">S/N</span> {result.data.serialNumber}</p>}
                      {result.data.ccNumber && <p><span className="font-medium">CC#</span> {result.data.ccNumber}</p>}
                      {result.data.custodianName && <p className="col-span-2"><span className="font-medium">Custodian</span> {result.data.custodianName}</p>}
                    </div>
                    <Badge variant={result.data.status === "active" ? "default" : "secondary"} className="mt-2 text-xs">
                      {result.data.status}
                    </Badge>
                  </div>
                </div>
                <Separator />
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" asChild>
                    <a href="#/assets">
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> View Assets
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href="#/my-custody">My Custody</a>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Scan history */}
      {history.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4" /> Scan History
              </CardTitle>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setHistory([])}>
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-64 overflow-y-auto">
              {history.map(rec => (
                <div key={rec.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${rec.resultType === "product" ? "bg-blue-500" : rec.resultType === "asset" ? "bg-green-500" : "bg-amber-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono truncate">{rec.code}</p>
                    {rec.name && <p className="text-xs text-muted-foreground truncate">{rec.name}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <Badge
                      variant={rec.resultType === "not_found" ? "outline" : "secondary"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {rec.resultType === "product" ? "Product" : rec.resultType === "asset" ? "Asset" : "Not found"}
                    </Badge>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {rec.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Settings tab (admin only) ──────────────────────────────────────────────────

function SettingsTab({ settings, onSave }: { settings: BarcodeSettings; onSave: (s: BarcodeSettings) => void }) {
  const [form, setForm] = useState<BarcodeSettings>(settings);
  const { mutate, isPending } = useMutation({
    mutationFn: () => saveBarcodeSettings(form),
    onSuccess: () => { toast.success("Barcode settings saved"); onSave(form); },
    onError: () => toast.error("Failed to save settings"),
  });

  const set = <K extends keyof BarcodeSettings>(key: K, val: BarcodeSettings[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  return (
    <div className="space-y-6 max-w-xl">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Default Barcode Types</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs mb-1.5 block">Products default type</Label>
            <Select value={form.productBarcodeType} onValueChange={v => set("productBarcodeType", v as BarcodeFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BARCODE_FORMAT_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Assets default type</Label>
            <Select value={form.assetBarcodeType} onValueChange={v => set("assetBarcodeType", v as BarcodeFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BARCODE_FORMAT_OPTIONS.filter(f => f.assetsOk).map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Auto-Generation Format</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block">Product prefix</Label>
              <Input value={form.productPrefix} onChange={e => set("productPrefix", e.target.value)} placeholder="PRD-" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Asset prefix</Label>
              <Input value={form.assetPrefix} onChange={e => set("assetPrefix", e.target.value)} placeholder="AST-" />
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Number padding (digits)</Label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => set("padding", Math.max(1, form.padding - 1))}>
                <Minus className="w-3 h-3" />
              </Button>
              <span className="w-12 text-center font-mono">{form.padding}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => set("padding", Math.min(12, form.padding + 1))}>
                <Plus className="w-3 h-3" />
              </Button>
              <span className="text-xs text-muted-foreground ml-1">
                → {form.productPrefix}{String(1).padStart(form.padding, "0")}
              </span>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-generate for products</p>
              <p className="text-xs text-muted-foreground">Generate barcode when product is created</p>
            </div>
            <Switch checked={form.autoGenerateProduct} onCheckedChange={v => set("autoGenerateProduct", v)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-generate for assets</p>
              <p className="text-xs text-muted-foreground">Generate barcode when asset is created</p>
            </div>
            <Switch checked={form.autoGenerateAsset} onCheckedChange={v => set("autoGenerateAsset", v)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Print Defaults</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs mb-1.5 block">Default label template</Label>
            <Select value={form.defaultTemplate} onValueChange={v => set("defaultTemplate", v as LabelTemplate)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(LABEL_TEMPLATES) as [LabelTemplate, { name: string; description: string }][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.name} — {v.description}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Default quantity per item</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={form.defaultQuantity}
              onChange={e => set("defaultQuantity", Math.max(1, parseInt(e.target.value) || 1))}
              className="w-28"
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => mutate()} disabled={isPending} className="w-full">
        <Save className="w-4 h-4 mr-2" /> {isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function BarcodesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: settings = BARCODE_DEFAULTS, refetch } = useQuery({
    queryKey: ["barcode_settings"],
    queryFn: getBarcodeSettings,
    staleTime: 1000 * 60 * 5,
  });

  return (
    <>
      {/* Print-only CSS */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #print-area { display: flex !important; flex-wrap: wrap; gap: 6px; padding: 8px; }
          #print-area,
          #print-area * { display: revert !important; }
          .barcode-label { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; }
          @page { margin: 8mm; size: A4; }
        }
      `}</style>

      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <QrCode className="w-6 h-6" /> Barcodes & Labels
          </h1>
          <p className="text-sm text-muted-foreground">Generate, print, and scan barcodes for products and assets</p>
        </div>

        <Tabs defaultValue="products">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="products" className="gap-1.5">
              <Package className="w-3.5 h-3.5" /> Products
            </TabsTrigger>
            <TabsTrigger value="assets" className="gap-1.5">
              <Briefcase className="w-3.5 h-3.5" /> Assets
            </TabsTrigger>
            <TabsTrigger value="scanner" className="gap-1.5">
              <ScanLine className="w-3.5 h-3.5" /> Scanner
            </TabsTrigger>
            <TabsTrigger value="import" className="gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Import
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" /> Reports
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="settings" className="gap-1.5">
                <Settings className="w-3.5 h-3.5" /> Settings
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="products" className="mt-4">
            <ProductsTab settings={settings} />
          </TabsContent>

          <TabsContent value="assets" className="mt-4">
            <AssetsTab settings={settings} />
          </TabsContent>

          <TabsContent value="scanner" className="mt-4">
            <ScannerTab />
          </TabsContent>

          <TabsContent value="import" className="mt-4">
            <ImportTab settings={settings} />
          </TabsContent>

          <TabsContent value="reports" className="mt-4">
            <ReportsTab settings={settings} />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="settings" className="mt-4">
              <SettingsTab settings={settings} onSave={() => refetch()} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );
}
