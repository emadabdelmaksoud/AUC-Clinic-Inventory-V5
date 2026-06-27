import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/permissions";
import {
  listAssets, listAssetTypes, listAssetCategories, ASSET_STATUS_LABELS,
  exportFullAssetRegister, exportAssetsByType, exportAssetsByStatus, exportAssetsByCustodian,
  exportPdfFullRegister, exportPdfByType, exportPdfByStatus, exportPdfByCustodian,
} from "@/lib/assets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Briefcase, ChevronDown, Download, Eye, FileSpreadsheet, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatusBadge, AssetDetail } from "./Assets";
import { toast } from "sonner";
import type { Asset, AssetType } from "@/lib/db";
import { Redirect } from "wouter";
import { format } from "date-fns";

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm font-medium mt-0.5">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Export Dropdown ───────────────────────────────────────────────────────────

function ExportDropdown() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setOpen(false);
    try { await fn(); } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  const groups = [
    {
      label: "Excel",
      icon: <FileSpreadsheet className="w-3.5 h-3.5" />,
      items: [
        { label: "Full Asset Register", fn: exportFullAssetRegister },
        { label: "Assets by Type", fn: exportAssetsByType },
        { label: "Assets by Status", fn: exportAssetsByStatus },
        { label: "Assets by Custodian", fn: exportAssetsByCustodian },
      ],
    },
    {
      label: "PDF",
      icon: <FileText className="w-3.5 h-3.5" />,
      items: [
        { label: "Full Asset Register", fn: exportPdfFullRegister },
        { label: "Assets by Type", fn: exportPdfByType },
        { label: "Assets by Status", fn: exportPdfByStatus },
        { label: "Assets by Custodian", fn: exportPdfByCustodian },
      ],
    },
  ];

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen(v => !v)} disabled={busy}>
        <Download className="w-4 h-4 mr-1.5" />
        {busy ? "Exporting…" : "Export Reports"}
        <ChevronDown className="w-3.5 h-3.5 ml-1" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-popover border rounded-md shadow-md py-1 text-sm">
            {groups.map((g, gi) => (
              <div key={g.label}>
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {g.icon} {g.label}
                </div>
                {g.items.map(item => (
                  <button key={item.label} className="w-full text-left px-5 py-1.5 hover:bg-accent transition-colors"
                    onClick={() => run(item.fn)}>
                    {item.label}
                  </button>
                ))}
                {gi < groups.length - 1 && <div className="border-t my-1" />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AssetReportPage() {
  const { user } = useAuth();
  const [viewingAsset, setViewingAsset] = useState<Asset | undefined>();

  if (!isSuperAdmin(user?.role)) return <Redirect to="/" />;

  const { data: assets = [], isLoading } = useQuery({ queryKey: ["assets"], queryFn: listAssets });
  const { data: types = [] } = useQuery({ queryKey: ["assetTypes"], queryFn: listAssetTypes });
  const { data: categories = [] } = useQuery({ queryKey: ["assetCategories"], queryFn: () => listAssetCategories() });

  const typeMap = Object.fromEntries(types.map(t => [t.id, t.name]));
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

  // Status counts
  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of assets) m[a.status] = (m[a.status] ?? 0) + 1;
    return m;
  }, [assets]);

  // By-type summary
  const typeSummary = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of assets) m[a.assetTypeId] = (m[a.assetTypeId] ?? 0) + 1;
    return Object.entries(m)
      .map(([id, count]) => ({ name: typeMap[id] ?? id, count }))
      .sort((a, b) => b.count - a.count);
  }, [assets, typeMap]);

  // Custodian summary
  const custodianSummary = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of assets) {
      const key = a.custodianName || "Unassigned";
      m[key] = (m[key] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [assets]);

  const activeCount = statusCounts["active"] ?? 0;
  const assignedCount = assets.filter(a => a.custodianType).length;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6" /> Asset Report
          </h1>
          <p className="text-sm text-muted-foreground">Summary and full register — {assets.length} total assets</p>
        </div>
        <ExportDropdown />
      </div>

      {/* Summary Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Assets" value={assets.length} />
          <StatCard label="Active" value={activeCount} sub={`${assets.length ? Math.round((activeCount / assets.length) * 100) : 0}% of total`} />
          <StatCard label="Assigned" value={assignedCount} sub="have a custodian" />
          <StatCard label="Types" value={types.length} sub="asset categories" />
        </div>
      )}

      {/* Two-column summary */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* By Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">By Status</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(ASSET_STATUS_LABELS).map(([status, label]) => {
              const count = statusCounts[status] ?? 0;
              const pct = assets.length ? Math.round((count / assets.length) * 100) : 0;
              return (
                <div key={status} className="flex items-center gap-3 py-1.5 text-sm border-b last:border-0">
                  <span className="flex-1">{label}</span>
                  <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right font-medium">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* By Type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">By Asset Type</CardTitle>
          </CardHeader>
          <CardContent>
            {typeSummary.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No data</p>
            ) : typeSummary.map(({ name, count }) => {
              const pct = assets.length ? Math.round((count / assets.length) * 100) : 0;
              return (
                <div key={name} className="flex items-center gap-3 py-1.5 text-sm border-b last:border-0">
                  <span className="flex-1 truncate">{name}</span>
                  <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right font-medium">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Top Custodians */}
      {custodianSummary.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top Custodians</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Custodian</th>
                    <th className="pb-2 font-medium text-right">Assets</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {custodianSummary.map(([name, count]) => (
                    <tr key={name} className="hover:bg-muted/30">
                      <td className="py-2">{name}</td>
                      <td className="py-2 text-right font-medium">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Asset List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Briefcase className="w-4 h-4" /> Full Asset Register
            <span className="font-normal text-muted-foreground">({assets.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
          ) : assets.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No assets registered yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Asset Name</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Type</th>
                    <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">FY / FA / Serial</th>
                    <th className="text-left px-4 py-3 font-medium hidden xl:table-cell">Custodian</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Date</th>
                    <th className="px-4 py-3 text-right font-medium">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {assets.map(a => (
                    <tr key={a.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{a.assetName}</td>
                      <td className="px-4 py-2.5 hidden md:table-cell text-muted-foreground">{typeMap[a.assetTypeId] ?? "—"}</td>
                      <td className="px-4 py-2.5 hidden lg:table-cell text-xs text-muted-foreground space-y-0.5">
                        {a.fyNumber && <p>FY: {a.fyNumber}</p>}
                        {a.faNumber && <p>FA: {a.faNumber}</p>}
                        {a.serialNumber && <p>S/N: {a.serialNumber}</p>}
                        {!a.fyNumber && !a.faNumber && !a.serialNumber && "—"}
                      </td>
                      <td className="px-4 py-2.5 hidden xl:table-cell">
                        <p className="text-sm">{a.custodianName || <span className="text-muted-foreground">—</span>}</p>
                        {a.custodianPhone && <p className="text-xs text-muted-foreground">{a.custodianPhone}</p>}
                      </td>
                      <td className="px-4 py-2.5"><StatusBadge status={a.status} /></td>
                      <td className="px-4 py-2.5 hidden md:table-cell text-xs text-muted-foreground">
                        {format(new Date(a.createdAt), "dd MMM yyyy")}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewingAsset(a)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!viewingAsset} onOpenChange={o => !o && setViewingAsset(undefined)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Briefcase className="w-4 h-4" /> Asset Details</DialogTitle>
            <DialogDescription>{viewingAsset?.assetName}</DialogDescription>
          </DialogHeader>
          {viewingAsset && <AssetDetail asset={viewingAsset} types={types} categories={categories} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
