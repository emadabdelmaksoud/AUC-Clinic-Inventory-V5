import { useState } from "react";
import { exportProductsExcel, exportInventoryExcel, importProductsFromExcel } from "@/lib/backup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUp, Download, Upload, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

export default function ImportExportPage() {
  const [importingProducts, setImportingProducts] = useState(false);

  async function handleImportProducts(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingProducts(true);
    try {
      const { imported, errors } = await importProductsFromExcel(file);
      if (imported > 0) toast.success(`Imported ${imported} product${imported !== 1 ? "s" : ""}`);
      if (errors.length > 0) toast.error(`${errors.length} error(s): ${errors.slice(0, 2).join("; ")}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
    setImportingProducts(false);
    e.target.value = "";
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileUp className="w-6 h-6" /> Import / Export</h1>
        <p className="text-sm text-muted-foreground">Move data in and out using Excel files</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Products</CardTitle>
            <CardDescription>Export product catalog or import from Excel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full" onClick={() => exportProductsExcel().catch(e => toast.error(e.message))} data-testid="button-export-products">
              <Download className="w-4 h-4 mr-1.5" /> Export Products
            </Button>
            <label className="block w-full">
              <input type="file" accept=".xlsx,.xls" onChange={handleImportProducts} className="hidden" data-testid="input-import-products" />
              <Button asChild variant="outline" disabled={importingProducts} className="w-full cursor-pointer" data-testid="button-import-products">
                <span><Upload className="w-4 h-4 mr-1.5" />{importingProducts ? "Importing..." : "Import Products"}</span>
              </Button>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Inventory</CardTitle>
            <CardDescription>Export current stock as Excel spreadsheet.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => exportInventoryExcel().catch(e => toast.error(e.message))} data-testid="button-export-inventory">
              <Download className="w-4 h-4 mr-1.5" /> Export Inventory
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Import Format</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Products Excel file must have these columns:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-2">
            <li><code className="text-xs bg-muted px-1 rounded">Product Name</code> (required)</li>
            <li><code className="text-xs bg-muted px-1 rounded">Product Code</code></li>
            <li><code className="text-xs bg-muted px-1 rounded">Barcode</code></li>
            <li><code className="text-xs bg-muted px-1 rounded">Category</code></li>
            <li><code className="text-xs bg-muted px-1 rounded">Manufacturer</code></li>
            <li><code className="text-xs bg-muted px-1 rounded">Base Unit</code></li>
            <li><code className="text-xs bg-muted px-1 rounded">Reorder Level</code></li>
            <li><code className="text-xs bg-muted px-1 rounded">Notes</code></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
