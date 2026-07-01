import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import JsBarcode from "jsbarcode";
import QRCodeLib from "qrcode";
import { listProducts, findProductByBarcode } from "@/lib/products";
import { listAssets } from "@/lib/assets";
import { listProductUnits } from "@/lib/product-units";
import { useAuth } from "@/lib/auth";
import {
  getBarcodeSettings, saveBarcodeSettings, generateNextProductBarcode,
  generateNextAssetBarcode, BARCODE_DEFAULTS,
  LABEL_TEMPLATES, BARCODE_FORMAT_OPTIONS, PRINT_QUANTITIES,
  type BarcodeSettings, type BarcodeFormat, type LabelTemplate,
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
  Briefcase, Plus, Minus, CheckSquare, Square, RefreshCw,
  AlertCircle, Save, ChevronRight, Keyboard,
} from "lucide-react";
import { toast } from "sonner";
import type { Asset } from "@/lib/db";

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

// ── Products tab ───────────────────────────────────────────────────────────────

function ProductsTab({ settings }: { settings: BarcodeSettings }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [barcodeFormat, setBarcodeFormat] = useState<BarcodeFormat>(settings.productBarcodeType);
  const [template, setTemplate] = useState<LabelTemplate>(settings.defaultTemplate === "qr_asset" ? "medium" : settings.defaultTemplate);
  const [qty, setQty] = useState(settings.defaultQuantity);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["products", search],
    queryFn: () => listProducts(search),
  });

  const { data: units = [] } = useQuery({
    queryKey: ["units", expandedProduct],
    queryFn: () => expandedProduct ? listProductUnits(expandedProduct) : Promise.resolve([]),
    enabled: !!expandedProduct,
  });

  const toggleProduct = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === products.length) setSelected(new Set());
    else setSelected(new Set(products.map(p => p.id)));
  };

  const selectedProducts = products.filter(p => selected.has(p.id));
  const printItems: { barcode: string; name: string; unit?: string }[] = [];
  for (const p of selectedProducts) {
    const bc = p.barcode?.trim();
    if (bc) {
      for (let i = 0; i < qty; i++) printItems.push({ barcode: bc, name: p.productName });
    }
    const pUnits = selectedUnitIds.size > 0 ? [] : [];
    for (const u of pUnits) printItems.push(u);
  }
  // also include selected units from all products
  const selectedUnitsList = units.filter(u => selectedUnitIds.has(u.id));
  for (const u of selectedUnitsList) {
    if (u.barcode) {
      const prod = products.find(p => p.id === expandedProduct);
      for (let i = 0; i < qty; i++) printItems.push({ barcode: u.barcode, name: prod?.productName ?? "", unit: u.unitName });
    }
  }

  const noBarcode = selectedProducts.filter(p => !p.barcode?.trim());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <Label className="text-xs mb-1 block">Search Products</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs mb-1 block">Barcode Type</Label>
          <Select value={barcodeFormat} onValueChange={v => setBarcodeFormat(v as BarcodeFormat)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BARCODE_FORMAT_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">Label Size</Label>
          <Select value={template} onValueChange={v => setTemplate(v as LabelTemplate)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(LABEL_TEMPLATES) as [LabelTemplate, { name: string; description: string }][])
                .filter(([k]) => k !== "qr_asset")
                .map(([k, v]) => <SelectItem key={k} value={k}>{v.name} ({v.description})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border overflow-hidden">
        <div className="flex items-center px-3 py-2 bg-muted/50 border-b gap-2">
          <Checkbox checked={selected.size === products.length && products.length > 0} onCheckedChange={toggleAll} />
          <span className="text-xs text-muted-foreground">{selected.size} of {products.length} selected</span>
        </div>
        <div className="max-h-56 overflow-y-auto divide-y">
          {products.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">No products found</p>
          )}
          {products.map(p => (
            <div key={p.id}>
              <div className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30">
                <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleProduct(p.id)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.productName}</p>
                  {p.barcode ? (
                    <p className="text-xs font-mono text-muted-foreground">{p.barcode}</p>
                  ) : (
                    <p className="text-xs text-amber-600">No barcode assigned</p>
                  )}
                </div>
                <button
                  onClick={() => setExpandedProduct(expandedProduct === p.id ? null : p.id)}
                  className="text-muted-foreground hover:text-foreground p-1"
                >
                  <ChevronRight className={`w-4 h-4 transition-transform ${expandedProduct === p.id ? "rotate-90" : ""}`} />
                </button>
              </div>
              {expandedProduct === p.id && units.length > 0 && (
                <div className="pl-10 pr-3 pb-2 bg-muted/20 divide-y divide-border/50">
                  {units.map(u => (
                    <div key={u.id} className="flex items-center gap-3 py-1.5">
                      <Checkbox
                        checked={selectedUnitIds.has(u.id)}
                        onCheckedChange={() => {
                          setSelectedUnitIds(prev => {
                            const next = new Set(prev);
                            next.has(u.id) ? next.delete(u.id) : next.add(u.id);
                            return next;
                          });
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{u.unitName}</p>
                        {u.barcode ? (
                          <p className="text-[10px] font-mono text-muted-foreground">{u.barcode}</p>
                        ) : (
                          <p className="text-[10px] text-amber-600">No barcode</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {noBarcode.length > 0 && (
        <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded p-2.5 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{noBarcode.length} selected product(s) have no barcode and will be skipped. Assign barcodes in Products.</span>
        </div>
      )}

      {selected.size > 0 && (
        <div className="space-y-3">
          <QuantitySelector value={qty} onChange={setQty} />
          {printItems.length > 0 ? (
            <PrintPreview title={`${printItems.length} label(s) ready`}>
              {printItems.map((item, i) => (
                <ProductLabel key={i} barcode={item.barcode} name={item.name} unit={item.unit} template={template} format={barcodeFormat} />
              ))}
            </PrintPreview>
          ) : (
            <p className="text-sm text-muted-foreground">Selected products have no barcodes to print.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Assets tab ─────────────────────────────────────────────────────────────────

function AssetsTab({ settings }: { settings: BarcodeSettings }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState<LabelTemplate>("qr_asset");
  const [qty, setQty] = useState(settings.defaultQuantity);
  const qc = useQueryClient();

  const { data: assets = [] } = useQuery({
    queryKey: ["assets"],
    queryFn: () => listAssets(),
  });

  const filtered = assets.filter(a =>
    !search ||
    a.assetName.toLowerCase().includes(search.toLowerCase()) ||
    a.faNumber?.toLowerCase().includes(search.toLowerCase()) ||
    a.serialNumber?.toLowerCase().includes(search.toLowerCase()) ||
    a.ccNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const { mutate: generateBarcode, isPending: generating } = useMutation({
    mutationFn: async (assetId: string) => {
      const code = await generateNextAssetBarcode(settings);
      const { updateAsset } = await import("@/lib/assets");
      const asset = assets.find(a => a.id === assetId);
      if (!asset) throw new Error("Asset not found");
      await updateAsset(assetId, { ...asset, barcode: code } as any, null);
      return code;
    },
    onSuccess: (code) => {
      toast.success(`Barcode generated: ${code}`);
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: () => toast.error("Failed to generate barcode"),
  });

  const toggleAsset = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(a => a.id)));
  };

  const selectedAssets = filtered.filter(a => selected.has(a.id));

  const getBarcodeValue = (asset: Asset) =>
    (asset as any).barcode?.trim() || asset.faNumber || asset.serialNumber || asset.id;

  const printItems: { asset: Asset; barcodeValue: string }[] = [];
  for (const a of selectedAssets) {
    const bv = getBarcodeValue(a);
    for (let i = 0; i < qty; i++) printItems.push({ asset: a, barcodeValue: bv });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <Label className="text-xs mb-1 block">Search Assets</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Name, FA#, serial..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
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
      </div>

      <div className="rounded-md border overflow-hidden">
        <div className="flex items-center px-3 py-2 bg-muted/50 border-b gap-2">
          <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
          <span className="text-xs text-muted-foreground">{selected.size} of {filtered.length} selected</span>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y">
          {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">No assets found</p>}
          {filtered.map(a => {
            const bv = getBarcodeValue(a);
            const hasDedicatedBarcode = !!(a as any).barcode?.trim();
            return (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30">
                <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleAsset(a.id)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.assetName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {a.faNumber && <span className="text-[10px] text-muted-foreground">FA: {a.faNumber}</span>}
                    {a.serialNumber && <span className="text-[10px] text-muted-foreground">S/N: {a.serialNumber}</span>}
                    {hasDedicatedBarcode && (
                      <span className="text-[10px] font-mono text-green-700">{(a as any).barcode}</span>
                    )}
                    {!hasDedicatedBarcode && (
                      <span className="text-[10px] text-amber-600">Using: {bv.slice(0, 20)}</span>
                    )}
                  </div>
                </div>
                <Badge variant={a.status === "active" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 shrink-0">
                  {a.status}
                </Badge>
                {!hasDedicatedBarcode && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2 shrink-0"
                    onClick={() => generateBarcode(a.id)}
                    disabled={generating}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" /> Generate
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="space-y-3">
          <QuantitySelector value={qty} onChange={setQty} />
          <PrintPreview title={`${printItems.length} label(s) ready`}>
            {printItems.map((item, i) => (
              <AssetLabel key={i} asset={item.asset} barcodeValue={item.barcodeValue} template={template} />
            ))}
          </PrintPreview>
        </div>
      )}
    </div>
  );
}

// ── Scanner tab ────────────────────────────────────────────────────────────────

function ScannerTab() {
  const [scanInput, setScanInput] = useState("");
  const [lastScan, setLastScan] = useState("");
  const [result, setResult] = useState<{ type: "product" | "asset" | "not_found"; data?: any } | null>(null);
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastKeyTime = useRef<number>(0);
  const bufferRef = useRef<string>("");

  const { data: products = [] } = useQuery({ queryKey: ["products", ""], queryFn: () => listProducts("") });
  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: () => listAssets() });

  const processBarcode = useCallback((code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLastScan(trimmed);
    setScanning(true);

    const product = products.find(p => p.barcode === trimmed);
    if (product) {
      setResult({ type: "product", data: product });
      setScanning(false);
      return;
    }
    const asset = assets.find(a =>
      (a as any).barcode === trimmed ||
      a.faNumber === trimmed ||
      a.serialNumber === trimmed ||
      a.ccNumber === trimmed
    );
    if (asset) {
      setResult({ type: "asset", data: asset });
      setScanning(false);
      return;
    }
    setResult({ type: "not_found" });
    setScanning(false);
  }, [products, assets]);

  // Keyboard scanner detection: fast successive keystrokes followed by Enter
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const gap = now - lastKeyTime.current;
      lastKeyTime.current = now;

      if (e.key === "Enter") {
        const buf = bufferRef.current;
        bufferRef.current = "";
        if (buf.length > 2) processBarcode(buf);
        return;
      }
      if (e.key.length === 1) {
        if (gap < 50) {
          bufferRef.current += e.key;
        } else {
          bufferRef.current = e.key;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [processBarcode]);

  const handleManualSearch = () => {
    if (scanInput.trim()) processBarcode(scanInput.trim());
  };

  // Focus input on tab load
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  return (
    <div className="space-y-6 max-w-xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Keyboard className="w-4 h-4" /> Barcode Scanner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            USB/Bluetooth barcode scanners are auto-detected — just scan any barcode and this page will find it.
            You can also type a barcode manually below.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                className="pl-9 font-mono"
                placeholder="Scan or type barcode..."
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleManualSearch()}
                data-testid="scanner-input"
              />
            </div>
            <Button onClick={handleManualSearch} disabled={!scanInput.trim()}>Search</Button>
          </div>
          {lastScan && (
            <p className="text-xs text-muted-foreground">Last scan: <span className="font-mono font-medium text-foreground">{lastScan}</span></p>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="pt-4">
            {result.type === "not_found" && (
              <div className="flex items-center gap-2 text-amber-700">
                <AlertCircle className="w-5 h-5" />
                <div>
                  <p className="font-medium text-sm">Barcode Not Found</p>
                  <p className="text-xs text-muted-foreground">No product or asset matched "{lastScan}"</p>
                </div>
              </div>
            )}
            {result.type === "product" && result.data && (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-50 rounded">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Product found</p>
                    <p className="font-semibold">{result.data.productName}</p>
                    <p className="text-sm text-muted-foreground">{result.data.barcode}</p>
                    {result.data.category && <Badge variant="secondary" className="mt-1 text-xs">{result.data.category}</Badge>}
                  </div>
                </div>
                <Separator />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <a href={`#/products/${result.data.id}`}>View Product</a>
                  </Button>
                </div>
              </div>
            )}
            {result.type === "asset" && result.data && (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-50 rounded">
                    <Briefcase className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Asset found</p>
                    <p className="font-semibold">{result.data.assetName}</p>
                    {result.data.faNumber && <p className="text-sm text-muted-foreground">FA#: {result.data.faNumber}</p>}
                    {result.data.serialNumber && <p className="text-sm text-muted-foreground">S/N: {result.data.serialNumber}</p>}
                    {result.data.custodianName && <p className="text-sm text-muted-foreground">Custodian: {result.data.custodianName}</p>}
                    <Badge variant={result.data.status === "active" ? "default" : "secondary"} className="mt-1 text-xs">{result.data.status}</Badge>
                  </div>
                </div>
                <Separator />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <a href="#/assets">View in Assets</a>
                  </Button>
                </div>
              </div>
            )}
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
