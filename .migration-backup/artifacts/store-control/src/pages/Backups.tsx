import { useState } from "react";
import { exportBackup, importBackup } from "@/lib/backup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HardDrive, Download, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function BackupsPage() {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try { await exportBackup(); toast.success("Backup downloaded"); }
    catch (e) { toast.error((e as Error).message); }
    setExporting(false);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm("This will merge the backup data into your current database. Continue?")) return;
    setImporting(true);
    try {
      const { imported } = await importBackup(file);
      toast.success(`Imported ${imported} records`);
    } catch (err) {
      toast.error((err as Error).message);
    }
    setImporting(false);
    e.target.value = "";
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><HardDrive className="w-6 h-6" /> Backups</h1>
        <p className="text-sm text-muted-foreground">Export and restore your local database</p>
      </div>

      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>All data is stored locally in your browser. Export backups regularly to prevent data loss if you clear browser storage.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Download className="w-4 h-4" /> Export Backup</CardTitle>
            <CardDescription>Download all your data as a JSON file.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExport} disabled={exporting} className="w-full" data-testid="button-export-backup">
              {exporting ? "Exporting..." : "Download Backup"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Upload className="w-4 h-4" /> Import Backup</CardTitle>
            <CardDescription>Restore from a previously exported JSON file. Merges into existing data.</CardDescription>
          </CardHeader>
          <CardContent>
            <label className="block w-full">
              <input type="file" accept=".json" onChange={handleImport} className="hidden" data-testid="input-import-file" />
              <Button asChild disabled={importing} variant="outline" className="w-full cursor-pointer" data-testid="button-import-backup">
                <span>{importing ? "Importing..." : "Select Backup File"}</span>
              </Button>
            </label>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Storage Information</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Storage type</span>
            <span>IndexedDB (Browser)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sync</span>
            <span>Offline only — no cloud sync</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Persistence</span>
            <span>Survives page reload, cleared on browser data wipe</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
