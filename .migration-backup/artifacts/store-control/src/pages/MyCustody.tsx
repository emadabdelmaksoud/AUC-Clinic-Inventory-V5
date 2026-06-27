import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { listAssetTypes, listAssetCategories, exportPdfMyCustody, ASSET_STATUS_LABELS } from "@/lib/assets";
import { db } from "@/lib/db";
import type { Asset } from "@/lib/db";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Shield, Download, FileSpreadsheet, FileText, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { StatusBadge, AssetDetail } from "./Assets";
import { cn } from "@/lib/utils";

export default function MyCustodyPage() {
  const { user } = useAuth();
  const [viewingAsset, setViewingAsset] = useState<Asset | undefined>();
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: myAssets = [], isLoading } = useQuery({
    queryKey: ["myAssets", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const all = await db.assets.toArray();
      return all.filter(a => a.custodianUserId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    enabled: !!user?.id,
  });

  const { data: types = [] } = useQuery({ queryKey: ["assetTypes"], queryFn: listAssetTypes });
  const { data: categories = [] } = useQuery({ queryKey: ["assetCategories"], queryFn: () => listAssetCategories() });

  async function handleExportExcel() {
    setBusy(true);
    setExportOpen(false);
    try {
      const typeMap = Object.fromEntries(types.map(t => [t.id, t.name]));
      const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
      const rows = myAssets.map(a => ({
        "Asset Name": a.assetName,
        "Asset Type": typeMap[a.assetTypeId] ?? "",
        "Category": a.assetCategoryId ? (catMap[a.assetCategoryId] ?? "") : "",
        "FY Number": a.fyNumber ?? "",
        "FA Number": a.faNumber ?? "",
        "CC Number": a.ccNumber ?? "",
        "Serial Number": a.serialNumber ?? "",
        "Quantity": a.quantity,
        "Status": ASSET_STATUS_LABELS[a.status] ?? a.status,
        "Phone": a.custodianPhone ?? "",
        "ID Number": a.custodianIdNumber ?? "",
        "Email": a.custodianEmail ?? "",
        "Notes": a.notes ?? "",
        "Created": a.createdAt.slice(0, 10),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "My Custody");
      XLSX.writeFile(wb, `my-custody-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  async function handleExportPdf() {
    setBusy(true);
    setExportOpen(false);
    try {
      await exportPdfMyCustody(myAssets, types, categories, user?.fullName || user?.username || "Me");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  const typeMap = Object.fromEntries(types.map(t => [t.id, t.name]));
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6" /> My Custody
          </h1>
          <p className="text-sm text-muted-foreground">
            Assets assigned to you — {myAssets.length} item{myAssets.length !== 1 ? "s" : ""}
          </p>
        </div>

        {myAssets.length > 0 && (
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setExportOpen(v => !v)} disabled={busy}>
              <Download className="w-4 h-4 mr-1.5" />
              {busy ? "Exporting…" : "Export"}
              <ChevronDown className="w-3.5 h-3.5 ml-1" />
            </Button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-popover border rounded-md shadow-md py-1 text-sm">
                  <button className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2"
                    onClick={handleExportExcel}>
                    <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
                  </button>
                  <button className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2"
                    onClick={handleExportPdf}>
                    <FileText className="w-3.5 h-3.5" /> Export PDF
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Custodian Info Card */}
      <div className="rounded-lg border bg-card px-4 py-3 flex flex-wrap gap-6 text-sm">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Name</p>
          <p className="font-medium">{user?.fullName || user?.username}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Username</p>
          <p className="font-mono">{user?.username}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Role</p>
          <p className="capitalize">{user?.role}</p>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : myAssets.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No assets in your custody</p>
          <p className="text-sm mt-1">Assets assigned to you as system user custodian will appear here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">Asset Name</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Type / Category</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">References</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Added</th>
                <th className="px-4 py-3 text-right font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {myAssets.map(asset => (
                <tr key={asset.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium">{asset.assetName}</p>
                    {asset.serialNumber && <p className="text-xs text-muted-foreground">S/N: {asset.serialNumber}</p>}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <p>{typeMap[asset.assetTypeId] ?? "—"}</p>
                    {asset.assetCategoryId && <p className="text-xs text-muted-foreground">{catMap[asset.assetCategoryId] ?? ""}</p>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground space-y-0.5">
                    {asset.fyNumber && <p>FY: {asset.fyNumber}</p>}
                    {asset.faNumber && <p>FA: {asset.faNumber}</p>}
                    {!asset.fyNumber && !asset.faNumber && <span>—</span>}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={asset.status} /></td>
                  <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                    {format(new Date(asset.createdAt), "dd MMM yyyy")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setViewingAsset(asset)}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!viewingAsset} onOpenChange={o => !o && setViewingAsset(undefined)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Shield className="w-4 h-4" /> Asset Details</DialogTitle>
            <DialogDescription>{viewingAsset?.assetName}</DialogDescription>
          </DialogHeader>
          {viewingAsset && <AssetDetail asset={viewingAsset} types={types} categories={categories} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
