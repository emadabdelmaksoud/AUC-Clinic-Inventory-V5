import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/permissions";
import {
  listAssets, createAsset, updateAsset, deleteAsset,
  listAssetTypes, listAssetCategories,
  filterAssets, seedDefaultAssetTypes,
  exportFullAssetRegister, exportAssetsByType, exportAssetsByStatus, exportAssetsByCustodian,
  ASSET_STATUS_LABELS,
  assetSchema, type AssetInput, type AssetFilters,
} from "@/lib/assets";
import { listUsers } from "@/lib/auth";
import type { Asset, AssetType, AssetCategory } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Briefcase, Plus, Search, Pencil, Trash2, Eye, X, Download,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Redirect } from "wouter";
import { cn } from "@/lib/utils";

// ── Status Badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300",
  in_storage: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
  under_maintenance: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",
  lost: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300",
  disposed: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("text-xs font-medium border", STATUS_COLORS[status] ?? "")}>
      {ASSET_STATUS_LABELS[status as keyof typeof ASSET_STATUS_LABELS] ?? status}
    </Badge>
  );
}

// ── Asset Form ────────────────────────────────────────────────────────────────

function AssetForm({ onClose, editing, types, categories }: {
  onClose: () => void;
  editing?: Asset;
  types: AssetType[];
  categories: AssetCategory[];
}) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: listUsers });

  const form = useForm<AssetInput>({
    resolver: zodResolver(assetSchema),
    defaultValues: editing
      ? {
          assetName: editing.assetName,
          assetTypeId: editing.assetTypeId,
          assetCategoryId: editing.assetCategoryId ?? "",
          fyNumber: editing.fyNumber ?? "",
          faNumber: editing.faNumber ?? "",
          ccNumber: editing.ccNumber ?? "",
          serialNumber: editing.serialNumber ?? "",
          quantity: editing.quantity,
          status: editing.status,
          custodianType: editing.custodianType ?? undefined,
          custodianUserId: editing.custodianUserId ?? "",
          custodianName: editing.custodianName ?? "",
          notes: editing.notes ?? "",
        }
      : {
          assetName: "",
          assetTypeId: "",
          assetCategoryId: "",
          fyNumber: "",
          faNumber: "",
          ccNumber: "",
          serialNumber: "",
          quantity: 1,
          status: "active",
          custodianType: undefined,
          custodianUserId: "",
          custodianName: "",
          notes: "",
        },
  });

  const selectedTypeId = form.watch("assetTypeId");
  const custodianType = form.watch("custodianType");
  const filteredCats = categories.filter(c => c.assetTypeId === selectedTypeId);

  // Reset category when type changes
  const prevTypeRef = useState(selectedTypeId)[0];
  useEffect(() => {
    if (selectedTypeId !== prevTypeRef) {
      form.setValue("assetCategoryId", "");
    }
  }, [selectedTypeId]);

  // When custodian type changes, clear the other field
  useEffect(() => {
    if (custodianType === "system_user") form.setValue("custodianName", "");
    if (custodianType === "external_staff") form.setValue("custodianUserId", "");
  }, [custodianType]);

  const { mutate, isPending } = useMutation({
    mutationFn: async (data: AssetInput): Promise<void> => {
      if (editing) await updateAsset(editing.id, data, user?.id ?? null);
      else await createAsset(data, user?.id ?? null);
    },
    onSuccess: () => {
      toast.success(editing ? "Asset updated" : "Asset created");
      qc.invalidateQueries({ queryKey: ["assets"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // When system_user selected, auto-populate custodian name from user list
  const handleUserSelect = (userId: string) => {
    form.setValue("custodianUserId", userId);
    const u = users.find(u => u.id === userId);
    if (u) form.setValue("custodianName", u.fullName || u.username);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(d => mutate(d))} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Asset Name */}
        <FormField control={form.control} name="assetName" render={({ field }) => (
          <FormItem>
            <FormLabel>Asset Name *</FormLabel>
            <FormControl><Input {...field} placeholder="e.g. Dell Laptop Model XPS 15" autoFocus /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        {/* Type + Category */}
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="assetTypeId" render={({ field }) => (
            <FormItem>
              <FormLabel>Asset Type *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger></FormControl>
                <SelectContent>
                  {types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="assetCategoryId" render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={!selectedTypeId || filteredCats.length === 0}>
                <FormControl><SelectTrigger><SelectValue placeholder={!selectedTypeId ? "Select type first" : filteredCats.length === 0 ? "No categories" : "Select…"} /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="">— None —</SelectItem>
                  {filteredCats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {/* Reference Numbers */}
        <div className="grid grid-cols-3 gap-3">
          <FormField control={form.control} name="fyNumber" render={({ field }) => (
            <FormItem>
              <FormLabel>FY Number</FormLabel>
              <FormControl><Input {...field} value={field.value ?? ""} placeholder="FY-…" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="faNumber" render={({ field }) => (
            <FormItem>
              <FormLabel>FA Number</FormLabel>
              <FormControl><Input {...field} value={field.value ?? ""} placeholder="FA-…" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="ccNumber" render={({ field }) => (
            <FormItem>
              <FormLabel>CC Number</FormLabel>
              <FormControl><Input {...field} value={field.value ?? ""} placeholder="CC-…" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {/* Serial + Quantity + Status */}
        <div className="grid grid-cols-3 gap-3">
          <FormField control={form.control} name="serialNumber" render={({ field }) => (
            <FormItem>
              <FormLabel>Serial Number</FormLabel>
              <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="quantity" render={({ field }) => (
            <FormItem>
              <FormLabel>Quantity</FormLabel>
              <FormControl><Input type="number" min={1} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {Object.entries(ASSET_STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {/* Custodian */}
        <div className="space-y-3">
          <FormField control={form.control} name="custodianType" render={({ field }) => (
            <FormItem>
              <FormLabel>Custodian Type</FormLabel>
              <Select value={field.value ?? ""} onValueChange={v => field.onChange(v === "" ? null : v)}>
                <FormControl><SelectTrigger><SelectValue placeholder="— Not assigned —" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="">— Not assigned —</SelectItem>
                  <SelectItem value="system_user">System User</SelectItem>
                  <SelectItem value="external_staff">External Staff</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          {custodianType === "system_user" && (
            <FormField control={form.control} name="custodianUserId" render={({ field }) => (
              <FormItem>
                <FormLabel>Select User *</FormLabel>
                <Select value={field.value ?? ""} onValueChange={handleUserSelect}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select a system user…" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.fullName || u.username} ({u.role})</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          )}

          {custodianType === "external_staff" && (
            <FormField control={form.control} name="custodianName" render={({ field }) => (
              <FormItem>
                <FormLabel>Custodian Name *</FormLabel>
                <FormControl><Input {...field} value={field.value ?? ""} placeholder="Enter staff name…" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          )}
        </div>

        {/* Notes */}
        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes</FormLabel>
            <FormControl><Textarea {...field} value={field.value ?? ""} rows={3} placeholder="Additional notes…" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : editing ? "Update Asset" : "Create Asset"}</Button>
        </div>
      </form>
    </Form>
  );
}

// ── Asset Detail View ─────────────────────────────────────────────────────────

function AssetDetail({ asset, types, categories }: { asset: Asset; types: AssetType[]; categories: AssetCategory[] }) {
  const typeName = types.find(t => t.id === asset.assetTypeId)?.name ?? "—";
  const catName = asset.assetCategoryId ? categories.find(c => c.id === asset.assetCategoryId)?.name ?? "—" : "—";

  const row = (label: string, value: string | number | null | undefined) => (
    <div className="flex gap-2 py-1.5 border-b last:border-0 text-sm">
      <span className="w-40 flex-shrink-0 text-muted-foreground">{label}</span>
      <span className="font-medium break-all">{value ?? "—"}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <StatusBadge status={asset.status} />
        <span className="text-sm text-muted-foreground">Qty: {asset.quantity}</span>
      </div>
      <div className="rounded-lg border bg-card px-4 py-2">
        {row("Asset Name", asset.assetName)}
        {row("Asset Type", typeName)}
        {row("Category", catName)}
        {row("FY Number", asset.fyNumber)}
        {row("FA Number", asset.faNumber)}
        {row("CC Number", asset.ccNumber)}
        {row("Serial Number", asset.serialNumber)}
        {row("Custodian Type", asset.custodianType === "system_user" ? "System User" : asset.custodianType === "external_staff" ? "External Staff" : null)}
        {row("Custodian", asset.custodianName)}
        {row("Notes", asset.notes)}
        {row("Created", format(new Date(asset.createdAt), "PPP"))}
        {row("Last Updated", format(new Date(asset.updatedAt), "PPP"))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  if (!isSuperAdmin(user?.role)) return <Redirect to="/" />;

  const { data: allAssets = [], isLoading } = useQuery({ queryKey: ["assets"], queryFn: listAssets });
  const { data: types = [] } = useQuery({ queryKey: ["assetTypes"], queryFn: listAssetTypes });
  const { data: categories = [] } = useQuery({ queryKey: ["assetCategories"], queryFn: () => listAssetCategories() });

  useEffect(() => {
    seedDefaultAssetTypes().then(() => {
      qc.invalidateQueries({ queryKey: ["assetTypes"] });
      qc.invalidateQueries({ queryKey: ["assetCategories"] });
    });
  }, []);

  const [filters, setFilters] = useState<AssetFilters>({});
  const [showCreate, setShowCreate] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | undefined>();
  const [viewingAsset, setViewingAsset] = useState<Asset | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filteredAssets = useMemo(() => filterAssets(allAssets, filters), [allAssets, filters]);

  const filteredCats = filters.assetTypeId
    ? categories.filter(c => c.assetTypeId === filters.assetTypeId)
    : categories;

  const { mutate: doDelete } = useMutation({
    mutationFn: deleteAsset,
    onSuccess: () => { toast.success("Asset deleted"); qc.invalidateQueries({ queryKey: ["assets"] }); setDeleteId(null); },
    onError: (e) => toast.error((e as Error).message),
  });

  async function handleExport(fn: () => Promise<void>) {
    setExporting(true);
    setShowExportMenu(false);
    try { await fn(); } catch (e) { toast.error((e as Error).message); }
    setExporting(false);
  }

  const clearFilters = () => setFilters({});
  const hasFilters = !!filters.search || !!filters.assetTypeId || !!filters.assetCategoryId || !!filters.status;

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="w-6 h-6" /> Assets & Equipment
          </h1>
          <p className="text-sm text-muted-foreground">
            {filteredAssets.length} of {allAssets.length} asset{allAssets.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Export dropdown */}
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setShowExportMenu(v => !v)} disabled={exporting}>
              <Download className="w-4 h-4 mr-1.5" />
              {exporting ? "Exporting…" : "Export"}
              <ChevronDown className="w-3.5 h-3.5 ml-1" />
            </Button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-popover border rounded-md shadow-md py-1 text-sm">
                  {[
                    { label: "Full Asset Register", fn: exportFullAssetRegister },
                    { label: "Assets by Type", fn: exportAssetsByType },
                    { label: "Assets by Status", fn: exportAssetsByStatus },
                    { label: "Assets by Custodian", fn: exportAssetsByCustodian },
                  ].map(({ label, fn }) => (
                    <button key={label} className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
                      onClick={() => handleExport(fn)}>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <Button size="sm" onClick={() => { setEditingAsset(undefined); setShowCreate(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Asset
          </Button>
        </div>
      </div>

      {/* Search + Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9"
                placeholder="Search name, serial, FY, FA, CC, custodian…"
                value={filters.search ?? ""}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              />
            </div>

            {/* Type filter */}
            <Select
              value={filters.assetTypeId ?? ""}
              onValueChange={v => setFilters(f => ({ ...f, assetTypeId: v || undefined, assetCategoryId: undefined }))}
            >
              <SelectTrigger className="w-44"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Types</SelectItem>
                {types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Category filter */}
            <Select
              value={filters.assetCategoryId ?? ""}
              onValueChange={v => setFilters(f => ({ ...f, assetCategoryId: v || undefined }))}
              disabled={filteredCats.length === 0}
            >
              <SelectTrigger className="w-44"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Categories</SelectItem>
                {filteredCats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Status filter */}
            <Select
              value={filters.status ?? ""}
              onValueChange={v => setFilters(f => ({ ...f, status: v as any || undefined }))}
            >
              <SelectTrigger className="w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Statuses</SelectItem>
                {Object.entries(ASSET_STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground">
                <X className="w-3.5 h-3.5" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">{hasFilters ? "No assets match your filters" : "No assets yet"}</p>
          <p className="text-sm mt-1">
            {hasFilters ? "Try adjusting your search or filters." : "Click \"Add Asset\" to register the first asset."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">Asset Name</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Type / Category</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Reference Nos.</th>
                <th className="text-left px-4 py-3 font-medium hidden xl:table-cell">Custodian</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredAssets.map(asset => {
                const typeName = types.find(t => t.id === asset.assetTypeId)?.name ?? "—";
                const catName = asset.assetCategoryId ? categories.find(c => c.id === asset.assetCategoryId)?.name : null;
                return (
                  <tr key={asset.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{asset.assetName}</p>
                      {asset.serialNumber && (
                        <p className="text-xs text-muted-foreground">S/N: {asset.serialNumber}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p>{typeName}</p>
                      {catName && <p className="text-xs text-muted-foreground">{catName}</p>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs space-y-0.5">
                      {asset.fyNumber && <p>FY: {asset.fyNumber}</p>}
                      {asset.faNumber && <p>FA: {asset.faNumber}</p>}
                      {asset.ccNumber && <p>CC: {asset.ccNumber}</p>}
                      {!asset.fyNumber && !asset.faNumber && !asset.ccNumber && <span>—</span>}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell text-sm">
                      {asset.custodianName || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={asset.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="View"
                          onClick={() => setViewingAsset(asset)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit"
                          onClick={() => { setEditingAsset(asset); setShowCreate(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" title="Delete"
                          onClick={() => setDeleteId(asset.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showCreate} onOpenChange={o => { if (!o) { setShowCreate(false); setEditingAsset(undefined); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingAsset ? "Edit Asset" : "Add Asset"}</DialogTitle>
            <DialogDescription>
              {editingAsset ? "Update the asset details below." : "Register a new asset or piece of equipment."}
            </DialogDescription>
          </DialogHeader>
          <AssetForm
            onClose={() => { setShowCreate(false); setEditingAsset(undefined); }}
            editing={editingAsset}
            types={types}
            categories={categories}
          />
        </DialogContent>
      </Dialog>

      {/* View Detail Dialog */}
      <Dialog open={!!viewingAsset} onOpenChange={o => !o && setViewingAsset(undefined)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="w-4 h-4" /> Asset Details
            </DialogTitle>
            <DialogDescription>{viewingAsset?.assetName}</DialogDescription>
          </DialogHeader>
          {viewingAsset && <AssetDetail asset={viewingAsset} types={types} categories={categories} />}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete asset?</AlertDialogTitle>
            <AlertDialogDescription>This asset will be permanently removed. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && doDelete(deleteId)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
