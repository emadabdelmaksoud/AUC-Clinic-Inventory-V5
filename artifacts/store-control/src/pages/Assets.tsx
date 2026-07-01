import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/permissions";
import {
  listAssets, createAsset, updateAsset, deleteAsset,
  listAssetTypes, listAssetCategories,
  filterAssets, seedDefaultAssetTypes,
  exportFullAssetRegister, exportAssetsByType, exportAssetsByStatus, exportAssetsByCustodian,
  exportPdfFullRegister, exportPdfByType, exportPdfByStatus, exportPdfByCustodian,
  listAssetTransactions, importAssetsFromExcel, downloadImportTemplate,
  ASSET_STATUS_LABELS,
  assetSchema, type AssetInput, type AssetFilters,
  listExternalStaff, upsertExternalStaff,
} from "@/lib/assets";
import { ComboboxInput } from "@/components/ui/combobox-input";
import { listUsers } from "@/lib/auth";
import { listWarehouses, listSections } from "@/lib/warehouses";
import { Link } from "wouter";
import type { Asset, AssetType, AssetCategory, AssetTransaction } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Briefcase, Plus, Search, Pencil, Trash2, Eye, X, Download, ChevronDown, FileSpreadsheet, FileText, ArrowRightLeft, Upload, Clock, MapPin } from "lucide-react";
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

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("text-xs font-medium border", STATUS_COLORS[status] ?? "")}>
      {ASSET_STATUS_LABELS[status as keyof typeof ASSET_STATUS_LABELS] ?? status}
    </Badge>
  );
}

// ── Asset Detail Row helper ───────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex gap-2 py-1.5 border-b last:border-0 text-sm">
      <span className="w-36 flex-shrink-0 text-muted-foreground">{label}</span>
      <span className="font-medium break-all">{value ?? "—"}</span>
    </div>
  );
}

// ── Action Badge (for history) ─────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  created: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300",
  updated: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
  deleted: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300",
  custody_transferred: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300",
  location_changed: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300",
  status_changed: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300",
  imported: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300",
};

const ACTION_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  custody_transferred: "Custody Transfer",
  location_changed: "Location Changed",
  status_changed: "Status Changed",
  imported: "Imported",
};

function ActionBadge({ action }: { action: string }) {
  return (
    <Badge variant="outline" className={cn("text-xs flex-shrink-0", ACTION_COLORS[action] ?? "")}>
      {ACTION_LABELS[action] ?? action}
    </Badge>
  );
}

// ── Asset Detail View ─────────────────────────────────────────────────────────

export function AssetDetail({ asset, types, categories }: { asset: Asset; types: AssetType[]; categories: AssetCategory[] }) {
  const typeName = types.find(t => t.id === asset.assetTypeId)?.name ?? "—";
  const catName = asset.assetCategoryId ? categories.find(c => c.id === asset.assetCategoryId)?.name ?? "—" : "—";

  const { data: warehouses = [] } = useQuery({ queryKey: ["warehouses"], queryFn: () => listWarehouses() });
  const { data: sections = [] } = useQuery({
    queryKey: ["sections", asset.warehouseId],
    queryFn: () => asset.warehouseId ? listSections(asset.warehouseId) : Promise.resolve([]),
    enabled: !!asset.warehouseId,
  });
  const { data: history = [] } = useQuery({
    queryKey: ["assetTransactions", asset.id],
    queryFn: () => listAssetTransactions(asset.id),
  });

  const warehouseName = asset.warehouseId ? (warehouses.find(w => w.id === asset.warehouseId)?.warehouseName ?? "—") : null;
  const sectionName = asset.sectionId ? (sections.find(s => s.id === asset.sectionId)?.sectionName ?? "—") : null;

  return (
    <Tabs defaultValue="details">
      <TabsList className="mb-3 w-full">
        <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
        <TabsTrigger value="history" className="flex-1">
          <Clock className="w-3.5 h-3.5 mr-1.5" />
          History {history.length > 0 && `(${history.length})`}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="details">
        <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
          <div className="flex items-center gap-2">
            <StatusBadge status={asset.status} />
            <span className="text-sm text-muted-foreground">Qty: {asset.quantity}</span>
          </div>
          <div className="rounded-lg border bg-card px-4 py-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Asset Info</p>
            <DetailRow label="Asset Name" value={asset.assetName} />
            <DetailRow label="Asset Type" value={typeName} />
            <DetailRow label="Category" value={catName} />
            <DetailRow label="FY Number" value={asset.fyNumber} />
            <DetailRow label="FA Number" value={asset.faNumber} />
            <DetailRow label="CC Number" value={asset.ccNumber} />
            <DetailRow label="Serial Number" value={asset.serialNumber} />
            <DetailRow label="Notes" value={asset.notes} />
          </div>
          {(warehouseName || sectionName) && (
            <div className="rounded-lg border bg-card px-4 py-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> Location
              </p>
              {warehouseName && <DetailRow label="Warehouse" value={warehouseName} />}
              {sectionName && <DetailRow label="Section" value={sectionName} />}
            </div>
          )}
          {asset.custodianType && (
            <div className="rounded-lg border bg-card px-4 py-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Custodian Info</p>
              <DetailRow label="Custodian Type" value={asset.custodianType === "system_user" ? "System User" : "External Staff"} />
              <DetailRow label="Name" value={asset.custodianName} />
              <DetailRow label="Phone" value={asset.custodianPhone} />
              <DetailRow label="ID Number" value={asset.custodianIdNumber} />
              <DetailRow label="Email" value={asset.custodianEmail} />
              <DetailRow label="Assignment Date" value={asset.custodianAssignmentDate ? format(new Date(asset.custodianAssignmentDate), "dd MMM yyyy") : null} />
              <DetailRow label="Notes" value={asset.custodianNotes} />
            </div>
          )}
          <div className="rounded-lg border bg-card px-4 py-2">
            <DetailRow label="Created" value={format(new Date(asset.createdAt), "PPP")} />
            <DetailRow label="Last Updated" value={format(new Date(asset.updatedAt), "PPP")} />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="history">
        <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
          {history.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No history recorded yet</p>
            </div>
          ) : (
            history.map(tx => (
              <div key={tx.id} className="flex gap-3 p-3 rounded-lg border bg-card text-sm">
                <Clock className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm leading-snug">{tx.summary}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                    {tx.performedByName && <span>By {tx.performedByName}</span>}
                    <span>{format(new Date(tx.createdAt), "dd MMM yyyy, HH:mm")}</span>
                  </div>
                </div>
                <ActionBadge action={tx.action} />
              </div>
            ))
          )}
        </div>
      </TabsContent>
    </Tabs>
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
  const { data: allAssets = [] } = useQuery({ queryKey: ["assets"], queryFn: listAssets });
  const { data: extStaffList = [] } = useQuery({ queryKey: ["externalStaff"], queryFn: listExternalStaff });

  // Build external-staff lookup: DB table takes priority, assets fill gaps for backward compat
  const externalCustodianMap = useMemo(() => {
    const map: Record<string, { phone: string; email: string; idNumber: string }> = {};
    for (const a of allAssets) {
      if (a.custodianType === "external_staff" && a.custodianName) {
        map[a.custodianName] = {
          phone: a.custodianPhone || "",
          email: a.custodianEmail || "",
          idNumber: a.custodianIdNumber || "",
        };
      }
    }
    for (const s of extStaffList) {
      map[s.name] = { phone: s.phone || "", email: s.email || "", idNumber: s.idNumber || "" };
    }
    return map;
  }, [allAssets, extStaffList]);
  const externalNames = useMemo(() => Object.keys(externalCustodianMap).sort(), [externalCustodianMap]);

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
          custodianPhone: editing.custodianPhone ?? "",
          custodianIdNumber: editing.custodianIdNumber ?? "",
          custodianEmail: editing.custodianEmail ?? "",
          custodianAssignmentDate: editing.custodianAssignmentDate ?? "",
          custodianNotes: editing.custodianNotes ?? "",
          notes: editing.notes ?? "",
          warehouseId: editing.warehouseId ?? null,
          sectionId: editing.sectionId ?? null,
        }
      : {
          assetName: "", assetTypeId: "", assetCategoryId: "", fyNumber: "", faNumber: "",
          ccNumber: "", serialNumber: "", quantity: 1, status: "active",
          custodianType: undefined, custodianUserId: "", custodianName: "",
          custodianPhone: "", custodianIdNumber: "", custodianEmail: "", custodianAssignmentDate: "", custodianNotes: "", notes: "",
          warehouseId: null, sectionId: null,
        },
  });

  const selectedTypeId = form.watch("assetTypeId");
  const custodianType = form.watch("custodianType");
  const filteredCats = categories.filter(c => c.assetTypeId === selectedTypeId);

  const prevTypeRef = useState(selectedTypeId)[0];
  useEffect(() => {
    if (selectedTypeId !== prevTypeRef) form.setValue("assetCategoryId", "");
  }, [selectedTypeId]);

  useEffect(() => {
    if (custodianType === "external_staff") form.setValue("custodianUserId", "");
  }, [custodianType]);

  const handleUserSelect = (userId: string) => {
    form.setValue("custodianUserId", userId);
    form.setValue("custodianName", "");
    form.setValue("custodianPhone", "");
    form.setValue("custodianEmail", "");
    form.setValue("custodianIdNumber", "");
    const u = users.find(u => u.id === userId);
    if (u) {
      form.setValue("custodianName", u.fullName || u.username);
      form.setValue("custodianPhone", u.phone ?? "");
      form.setValue("custodianEmail", u.email ?? "");
      form.setValue("custodianIdNumber", u.employeeId ?? "");
    }
  };

  const { data: warehouses = [] } = useQuery({ queryKey: ["warehouses"], queryFn: () => listWarehouses() });
  const selectedWarehouseId = form.watch("warehouseId");
  const { data: availableSections = [] } = useQuery({
    queryKey: ["sections", selectedWarehouseId],
    queryFn: () => selectedWarehouseId ? listSections(selectedWarehouseId) : Promise.resolve([]),
    enabled: !!selectedWarehouseId,
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async (data: AssetInput): Promise<void> => {
      const uName = user?.fullName || user?.username || null;
      if (editing) await updateAsset(editing.id, data, user?.id ?? null, uName);
      else await createAsset(data, user?.id ?? null, uName);
      if (data.custodianType === "external_staff" && data.custodianName) {
        await upsertExternalStaff({
          name: data.custodianName,
          phone: data.custodianPhone,
          email: data.custodianEmail,
          idNumber: data.custodianIdNumber,
        });
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Asset updated" : "Asset created");
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["externalStaff"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(d => mutate(d))} className="flex flex-col" style={{ maxHeight: "72vh" }}>
        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-4 pb-2">

          {/* Asset Name */}
          <FormField control={form.control} name="assetName" render={({ field }) => (
            <FormItem>
              <FormLabel>Asset Name *</FormLabel>
              <FormControl><Input {...field} placeholder="e.g. Dell Laptop XPS 15" autoFocus /></FormControl>
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
                <Select value={field.value ?? ""} onValueChange={field.onChange}
                  disabled={!selectedTypeId || filteredCats.length === 0}>
                  <FormControl><SelectTrigger>
                    <SelectValue placeholder={!selectedTypeId ? "Select type first" : filteredCats.length === 0 ? "No categories" : "Select…"} />
                  </SelectTrigger></FormControl>
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
              <FormItem><FormLabel>FY Number</FormLabel><FormControl><Input {...field} value={field.value ?? ""} placeholder="FY-…" /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="faNumber" render={({ field }) => (
              <FormItem><FormLabel>FA Number</FormLabel><FormControl><Input {...field} value={field.value ?? ""} placeholder="FA-…" /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="ccNumber" render={({ field }) => (
              <FormItem><FormLabel>CC Number</FormLabel><FormControl><Input {...field} value={field.value ?? ""} placeholder="CC-…" /></FormControl><FormMessage /></FormItem>
            )} />
          </div>

          {/* Serial + Quantity + Status */}
          <div className="grid grid-cols-3 gap-3">
            <FormField control={form.control} name="serialNumber" render={({ field }) => (
              <FormItem><FormLabel>Serial Number</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="quantity" render={({ field }) => (
              <FormItem><FormLabel>Quantity</FormLabel><FormControl><Input type="number" min={1} {...field} /></FormControl><FormMessage /></FormItem>
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

          {/* Location */}
          <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
            <Label className="text-sm font-semibold flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Location</Label>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="warehouseId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">Warehouse</FormLabel>
                  <Select value={field.value ?? ""} onValueChange={v => { field.onChange(v || null); form.setValue("sectionId", null); }}>
                    <FormControl><SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="">— None —</SelectItem>
                      {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.warehouseName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="sectionId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">Section</FormLabel>
                  <Select value={field.value ?? ""} onValueChange={v => field.onChange(v || null)}
                    disabled={!selectedWarehouseId || availableSections.length === 0}>
                    <FormControl><SelectTrigger>
                      <SelectValue placeholder={!selectedWarehouseId ? "Select warehouse first" : availableSections.length === 0 ? "No sections" : "— None —"} />
                    </SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="">— None —</SelectItem>
                      {availableSections.map(s => <SelectItem key={s.id} value={s.id}>{s.sectionName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </div>

          {/* Custodian Type */}
          <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
            <Label className="text-sm font-semibold">Custodian</Label>
            <FormField control={form.control} name="custodianType" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground">Custodian Type</FormLabel>
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
                  <FormLabel className="text-xs text-muted-foreground">Select System User *</FormLabel>
                  <Select value={field.value ?? ""} onValueChange={handleUserSelect}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {users.map(u => <SelectItem key={u.id} value={u.id}>{u.fullName || u.username} ({u.role})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {custodianType && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="custodianName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">
                        Full Name{custodianType === "system_user" ? " (auto-filled)" : ""}
                      </FormLabel>
                      <FormControl>
                        {custodianType === "external_staff" ? (
                          <ComboboxInput
                            value={field.value ?? ""}
                            onChange={name => {
                              field.onChange(name);
                              const match = externalCustodianMap[name];
                              if (match) {
                                form.setValue("custodianPhone", match.phone);
                                form.setValue("custodianEmail", match.email);
                                form.setValue("custodianIdNumber", match.idNumber);
                              }
                            }}
                            options={externalNames}
                            placeholder="Type or select external staff…"
                          />
                        ) : (
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="Custodian full name"
                            readOnly
                          />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="custodianPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Phone Number</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} placeholder="+966 5x xxx xxxx" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="custodianIdNumber" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">ID / National ID</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} placeholder="ID number" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="custodianEmail" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Email</FormLabel>
                      <FormControl><Input type="email" {...field} value={field.value ?? ""} placeholder="email@example.com" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="custodianAssignmentDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Assignment Date</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="custodianNotes" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Custodian Notes</FormLabel>
                    <FormControl><Textarea {...field} value={field.value ?? ""} rows={2} placeholder="Additional custodian info…" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </>
            )}
          </div>

          {/* Asset Notes */}
          <FormField control={form.control} name="notes" render={({ field }) => (
            <FormItem>
              <FormLabel>Asset Notes</FormLabel>
              <FormControl><Textarea {...field} value={field.value ?? ""} rows={2} placeholder="Any additional notes about this asset…" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {/* Sticky footer */}
        <div className="flex justify-end gap-2 pt-3 border-t mt-2 flex-shrink-0">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : editing ? "Update Asset" : "Create Asset"}</Button>
        </div>
      </form>
    </Form>
  );
}

// ── Transfer Custody Dialog ───────────────────────────────────────────────────

function TransferCustodyDialog({ asset, types, categories, onClose }: {
  asset: Asset;
  types: AssetType[];
  categories: AssetCategory[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: listUsers });
  const { data: allAssets = [] } = useQuery({ queryKey: ["assets"], queryFn: listAssets });
  const { data: extStaffList = [] } = useQuery({ queryKey: ["externalStaff"], queryFn: listExternalStaff });

  // Build external-staff lookup: DB table takes priority, assets fill gaps for backward compat
  const externalCustodianMap = useMemo(() => {
    const map: Record<string, { phone: string; email: string; idNumber: string }> = {};
    for (const a of allAssets) {
      if (a.custodianType === "external_staff" && a.custodianName) {
        map[a.custodianName] = {
          phone: a.custodianPhone || "",
          email: a.custodianEmail || "",
          idNumber: a.custodianIdNumber || "",
        };
      }
    }
    for (const s of extStaffList) {
      map[s.name] = { phone: s.phone || "", email: s.email || "", idNumber: s.idNumber || "" };
    }
    return map;
  }, [allAssets, extStaffList]);
  const externalNames = useMemo(() => Object.keys(externalCustodianMap).sort(), [externalCustodianMap]);

  const today = new Date().toISOString().slice(0, 10);

  const form = useForm<AssetInput>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      assetName: asset.assetName,
      assetTypeId: asset.assetTypeId,
      assetCategoryId: asset.assetCategoryId ?? "",
      fyNumber: asset.fyNumber ?? "",
      faNumber: asset.faNumber ?? "",
      ccNumber: asset.ccNumber ?? "",
      serialNumber: asset.serialNumber ?? "",
      quantity: asset.quantity,
      status: asset.status,
      notes: asset.notes ?? "",
      custodianType: undefined,
      custodianUserId: "",
      custodianName: "",
      custodianPhone: "",
      custodianIdNumber: "",
      custodianEmail: "",
      custodianAssignmentDate: today,
      custodianNotes: "",
    },
  });

  const custodianType = form.watch("custodianType");

  const handleUserSelect = (userId: string) => {
    form.setValue("custodianUserId", userId);
    form.setValue("custodianName", "");
    form.setValue("custodianPhone", "");
    form.setValue("custodianEmail", "");
    form.setValue("custodianIdNumber", "");
    const u = users.find(u => u.id === userId);
    if (u) {
      form.setValue("custodianName", u.fullName || u.username);
      form.setValue("custodianPhone", u.phone ?? "");
      form.setValue("custodianEmail", u.email ?? "");
      form.setValue("custodianIdNumber", u.employeeId ?? "");
    }
  };

  const { mutate, isPending } = useMutation({
    mutationFn: async (data: AssetInput) => {
      await updateAsset(asset.id, data, user?.id ?? null);
      if (data.custodianType === "external_staff" && data.custodianName) {
        await upsertExternalStaff({
          name: data.custodianName,
          phone: data.custodianPhone,
          email: data.custodianEmail,
          idNumber: data.custodianIdNumber,
        });
      }
    },
    onSuccess: () => {
      toast.success("Custody transferred successfully");
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["myAssets"] });
      qc.invalidateQueries({ queryKey: ["externalStaff"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const prevCustodian = asset.custodianName || "—";
  const prevType = asset.custodianType === "system_user" ? "System User" : asset.custodianType === "external_staff" ? "External Staff" : "Unassigned";

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(d => mutate(d))} className="flex flex-col" style={{ maxHeight: "72vh" }}>
        <div className="overflow-y-auto flex-1 pr-1 space-y-4 pb-2">

          {/* Current custodian (read-only) */}
          <div className="rounded-lg bg-muted/40 border px-4 py-3 space-y-1.5 text-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Current Custodian</p>
            <div className="flex gap-2">
              <span className="w-28 text-muted-foreground flex-shrink-0">Type</span>
              <span className="font-medium">{prevType}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-28 text-muted-foreground flex-shrink-0">Name</span>
              <span className="font-medium">{prevCustodian}</span>
            </div>
            {asset.custodianPhone && (
              <div className="flex gap-2">
                <span className="w-28 text-muted-foreground flex-shrink-0">Phone</span>
                <span>{asset.custodianPhone}</span>
              </div>
            )}
            {asset.custodianAssignmentDate && (
              <div className="flex gap-2">
                <span className="w-28 text-muted-foreground flex-shrink-0">Assignment Date</span>
                <span>{format(new Date(asset.custodianAssignmentDate), "dd MMM yyyy")}</span>
              </div>
            )}
          </div>

          {/* New custodian */}
          <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
            <Label className="text-sm font-semibold">New Custodian</Label>

            <FormField control={form.control} name="custodianType" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground">Custodian Type *</FormLabel>
                <Select value={field.value ?? ""} onValueChange={v => {
                  field.onChange(v === "" ? null : v);
                  form.setValue("custodianUserId", "");
                  form.setValue("custodianName", "");
                }}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger></FormControl>
                  <SelectContent>
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
                  <FormLabel className="text-xs text-muted-foreground">Select System User *</FormLabel>
                  <Select value={field.value ?? ""} onValueChange={handleUserSelect}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {users.map(u => <SelectItem key={u.id} value={u.id}>{u.fullName || u.username} ({u.role})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {custodianType && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="custodianName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">
                        Full Name{custodianType === "system_user" ? " (auto-filled)" : ""}
                      </FormLabel>
                      <FormControl>
                        {custodianType === "external_staff" ? (
                          <ComboboxInput
                            value={field.value ?? ""}
                            onChange={name => {
                              field.onChange(name);
                              const match = externalCustodianMap[name];
                              if (match) {
                                form.setValue("custodianPhone", match.phone);
                                form.setValue("custodianEmail", match.email);
                                form.setValue("custodianIdNumber", match.idNumber);
                              }
                            }}
                            options={externalNames}
                            placeholder="Type or select external staff…"
                          />
                        ) : (
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="Custodian full name"
                            readOnly
                          />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="custodianPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Phone Number</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} placeholder="+966…" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="custodianIdNumber" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">ID / National ID</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} placeholder="ID number" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="custodianEmail" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Email</FormLabel>
                      <FormControl><Input type="email" {...field} value={field.value ?? ""} placeholder="email@example.com" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="custodianAssignmentDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Assignment Date</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="custodianNotes" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Transfer Notes</FormLabel>
                    <FormControl><Textarea {...field} value={field.value ?? ""} rows={2} placeholder="Reason for transfer, handover remarks…" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t mt-2 flex-shrink-0">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isPending || !custodianType}>
            <ArrowRightLeft className="w-4 h-4 mr-1.5" />
            {isPending ? "Transferring…" : "Transfer Custody"}
          </Button>
        </div>
      </form>
    </Form>
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
        {busy ? "Exporting…" : "Export"}
        <ChevronDown className="w-3.5 h-3.5 ml-1" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-popover border rounded-md shadow-md py-1 text-sm">
            {groups.map(g => (
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
                <div className="border-t my-1 last:hidden" />
              </div>
            ))}
          </div>
        </>
      )}
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
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: listUsers });
  const { data: warehouses = [] } = useQuery({ queryKey: ["warehouses"], queryFn: () => listWarehouses() });

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
  const [transferringAsset, setTransferringAsset] = useState<Asset | undefined>();

  const filteredAssets = useMemo(() => filterAssets(allAssets, filters), [allAssets, filters]);
  const filteredCats = filters.assetTypeId ? categories.filter(c => c.assetTypeId === filters.assetTypeId) : categories;

  const { mutate: doDelete } = useMutation({
    mutationFn: (id: string) => deleteAsset(id, user?.id ?? null, user?.fullName || user?.username || null),
    onSuccess: () => { toast.success("Asset deleted"); qc.invalidateQueries({ queryKey: ["assets"] }); setDeleteId(null); },
    onError: (e) => toast.error((e as Error).message),
  });

  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await importAssetsFromExcel(file, user?.id ?? null, user?.fullName || user?.username || null);
      toast.success(`Imported ${result.imported} asset${result.imported !== 1 ? "s" : ""}`);
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} row${result.errors.length !== 1 ? "s" : ""} skipped`, {
          description: result.errors.slice(0, 3).join(" • ") + (result.errors.length > 3 ? ` …and ${result.errors.length - 3} more` : ""),
        });
      }
      qc.invalidateQueries({ queryKey: ["assets"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
    setImporting(false);
    e.target.value = "";
  }

  const hasFilters = !!filters.search || !!filters.assetTypeId || !!filters.assetCategoryId || !!filters.status || !!filters.warehouseId || !!filters.custodianUserId;

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Hidden import file input */}
      <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="w-6 h-6" /> Assets & Equipment
          </h1>
          <p className="text-sm text-muted-foreground">
            {filteredAssets.length} of {allAssets.length} asset{allAssets.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button variant="outline" size="sm" disabled={importing} onClick={() => importRef.current?.click()}>
              <Upload className="w-4 h-4 mr-1.5" />
              {importing ? "Importing…" : "Import"}
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground text-xs" title="Download import template"
            onClick={() => downloadImportTemplate()}>
            Template
          </Button>
          <ExportDropdown />
          <Button size="sm" onClick={() => { setEditingAsset(undefined); setShowCreate(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Asset
          </Button>
        </div>
      </div>

      {/* Search + Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input className="pl-9" placeholder="Search name, serial, FY, FA, CC, custodian…"
                value={filters.search ?? ""} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
            </div>
            <Select value={filters.assetTypeId ?? ""} onValueChange={v => setFilters(f => ({ ...f, assetTypeId: v || undefined, assetCategoryId: undefined }))}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Types</SelectItem>
                {types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.assetCategoryId ?? ""} onValueChange={v => setFilters(f => ({ ...f, assetCategoryId: v || undefined }))}
              disabled={filteredCats.length === 0}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Categories</SelectItem>
                {filteredCats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.status ?? ""} onValueChange={v => setFilters(f => ({ ...f, status: v as any || undefined }))}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Statuses</SelectItem>
                {Object.entries(ASSET_STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.warehouseId ?? ""} onValueChange={v => setFilters(f => ({ ...f, warehouseId: v || undefined }))}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All Locations" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Locations</SelectItem>
                {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.warehouseName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.custodianUserId ?? ""} onValueChange={v => setFilters(f => ({ ...f, custodianUserId: v || undefined }))}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All Custodians" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Custodians</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.fullName || u.username}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={() => setFilters({})} className="gap-1.5 text-muted-foreground">
                <X className="w-3.5 h-3.5" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : filteredAssets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">{hasFilters ? "No assets match your filters" : "No assets yet"}</p>
          <p className="text-sm mt-1">{hasFilters ? "Try adjusting your search or filters." : "Click \"Add Asset\" to register the first asset."}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">Asset Name</th>
                <th className="text-left px-4 py-3 font-medium">Type / Category</th>
                <th className="text-left px-4 py-3 font-medium">Ref. Nos.</th>
                <th className="text-left px-4 py-3 font-medium">Custodian</th>
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
                      {asset.serialNumber && <p className="text-xs text-muted-foreground">S/N: {asset.serialNumber}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p>{typeName}</p>
                      {catName && <p className="text-xs text-muted-foreground">{catName}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs space-y-0.5">
                      {asset.fyNumber && <p>FY: {asset.fyNumber}</p>}
                      {asset.faNumber && <p>FA: {asset.faNumber}</p>}
                      {asset.ccNumber && <p>CC: {asset.ccNumber}</p>}
                      {!asset.fyNumber && !asset.faNumber && !asset.ccNumber && <span>—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {asset.custodianUserId && asset.custodianType === "system_user" ? (
                        <Link href={`/users/${asset.custodianUserId}`} className="font-medium hover:underline text-primary">
                          {asset.custodianName || "View User"}
                        </Link>
                      ) : (
                        <p>{asset.custodianName || <span className="text-muted-foreground">—</span>}</p>
                      )}
                      {asset.custodianPhone && <p className="text-xs text-muted-foreground">{asset.custodianPhone}</p>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={asset.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="View details" onClick={() => setViewingAsset(asset)}><Eye className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit asset" onClick={() => { setEditingAsset(asset); setShowCreate(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20" title="Transfer custody" onClick={() => setTransferringAsset(asset)}><ArrowRightLeft className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" title="Delete asset" onClick={() => setDeleteId(asset.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
            <DialogDescription>{editingAsset ? "Update the asset details below." : "Register a new asset or piece of equipment."}</DialogDescription>
          </DialogHeader>
          <AssetForm onClose={() => { setShowCreate(false); setEditingAsset(undefined); }} editing={editingAsset} types={types} categories={categories} />
        </DialogContent>
      </Dialog>

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

      {/* Transfer Custody Dialog */}
      <Dialog open={!!transferringAsset} onOpenChange={o => !o && setTransferringAsset(undefined)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" /> Transfer Custody
            </DialogTitle>
            <DialogDescription>
              <span className="font-medium">{transferringAsset?.assetName}</span> — assign this asset to a new custodian.
            </DialogDescription>
          </DialogHeader>
          {transferringAsset && (
            <TransferCustodyDialog
              asset={transferringAsset}
              types={types}
              categories={categories}
              onClose={() => setTransferringAsset(undefined)}
            />
          )}
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
