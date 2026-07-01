import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/permissions";
import {
  listAssetTypes, createAssetType, updateAssetType, deleteAssetType,
  listAssetCategories, createAssetCategory, updateAssetCategory, deleteAssetCategory,
  seedDefaultAssetTypes,
  type AssetTypeInput, type AssetCategoryInput,
} from "@/lib/assets";
import type { AssetType, AssetCategory } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, FolderOpen, Plus, Pencil, Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Redirect } from "wouter";

// ── Asset Type Form ───────────────────────────────────────────────────────────

function AssetTypeForm({ onClose, editing }: { onClose: () => void; editing?: AssetType }) {
  const qc = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateAssetType(editing.id, { name });
        toast.success("Asset type updated");
      } else {
        await createAssetType({ name });
        toast.success("Asset type created");
      }
      qc.invalidateQueries({ queryKey: ["assetTypes"] });
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Type Name *</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Medical Equipment" autoFocus />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Update" : "Create"}</Button>
      </div>
    </form>
  );
}

// ── Asset Category Form ───────────────────────────────────────────────────────

function AssetCategoryForm({ onClose, editing, types, defaultTypeId }: {
  onClose: () => void;
  editing?: AssetCategory;
  types: AssetType[];
  defaultTypeId?: string;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [typeId, setTypeId] = useState(editing?.assetTypeId ?? defaultTypeId ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!typeId) { toast.error("Asset type is required"); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateAssetCategory(editing.id, { name, assetTypeId: typeId });
        toast.success("Category updated");
      } else {
        await createAssetCategory({ name, assetTypeId: typeId });
        toast.success("Category created");
      }
      qc.invalidateQueries({ queryKey: ["assetCategories"] });
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Asset Type *</Label>
        <Select value={typeId} onValueChange={setTypeId}>
          <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
          <SelectContent>
            {types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Category Name *</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Laptop" autoFocus />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Update" : "Create"}</Button>
      </div>
    </form>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AssetTypesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  if (!isSuperAdmin(user?.role)) return <Redirect to="/" />;

  const { data: types = [], isLoading: typesLoading } = useQuery({
    queryKey: ["assetTypes"],
    queryFn: listAssetTypes,
  });

  const { data: categories = [], isLoading: catsLoading } = useQuery({
    queryKey: ["assetCategories"],
    queryFn: () => listAssetCategories(),
  });

  useEffect(() => {
    seedDefaultAssetTypes().then(() => {
      qc.invalidateQueries({ queryKey: ["assetTypes"] });
      qc.invalidateQueries({ queryKey: ["assetCategories"] });
    });
  }, []);

  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingType, setEditingType] = useState<AssetType | undefined>();
  const [deleteTypeId, setDeleteTypeId] = useState<string | null>(null);

  const [showCatForm, setShowCatForm] = useState(false);
  const [catDefaultTypeId, setCatDefaultTypeId] = useState<string | undefined>();
  const [editingCat, setEditingCat] = useState<AssetCategory | undefined>();
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null);

  const { mutate: doDeleteType } = useMutation({
    mutationFn: deleteAssetType,
    onSuccess: () => { toast.success("Asset type deleted"); qc.invalidateQueries({ queryKey: ["assetTypes"] }); setDeleteTypeId(null); },
    onError: (e) => { toast.error((e as Error).message); setDeleteTypeId(null); },
  });

  const { mutate: doDeleteCat } = useMutation({
    mutationFn: deleteAssetCategory,
    onSuccess: () => { toast.success("Category deleted"); qc.invalidateQueries({ queryKey: ["assetCategories"] }); setDeleteCatId(null); },
    onError: (e) => { toast.error((e as Error).message); setDeleteCatId(null); },
  });

  const catsByType = (typeId: string) => categories.filter(c => c.assetTypeId === typeId);

  const isLoading = typesLoading || catsLoading;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FolderOpen className="w-6 h-6" /> Types & Categories
        </h1>
        <p className="text-sm text-muted-foreground">Manage asset types and their categories</p>
      </div>

      {/* Asset Types */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="w-4 h-4" /> Asset Types
              <span className="text-sm font-normal text-muted-foreground">({types.length})</span>
            </CardTitle>
            <Button size="sm" onClick={() => { setEditingType(undefined); setShowTypeForm(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Add Type
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
          ) : types.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No asset types yet. Click "Add Type" to create one.
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-2.5 font-medium">Type Name</th>
                    <th className="text-left px-4 py-2.5 font-medium">Categories</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {types.map(type => (
                    <tr key={type.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{type.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {catsByType(type.id).length} categor{catsByType(type.id).length !== 1 ? "ies" : "y"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => { setEditingType(type); setShowTypeForm(true); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTypeId(type.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Asset Categories */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="w-4 h-4" /> Asset Categories
              <span className="text-sm font-normal text-muted-foreground">({categories.length})</span>
            </CardTitle>
            <Button size="sm" onClick={() => { setEditingCat(undefined); setCatDefaultTypeId(undefined); setShowCatForm(true); }}
              disabled={types.length === 0}>
              <Plus className="w-4 h-4 mr-1" /> Add Category
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {types.length === 0 && !isLoading ? (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              Create at least one asset type before adding categories.
            </div>
          ) : isLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No categories yet. Click "Add Category" to create one.
            </div>
          ) : (
            <div className="space-y-4">
              {types.filter(t => catsByType(t.id).length > 0).map(type => (
                <div key={type.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{type.name}</p>
                    <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2"
                      onClick={() => { setEditingCat(undefined); setCatDefaultTypeId(type.id); setShowCatForm(true); }}>
                      <Plus className="w-3 h-3" /> Add
                    </Button>
                  </div>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody className="divide-y">
                        {catsByType(type.id).map(cat => (
                          <tr key={cat.id} className="hover:bg-muted/30">
                            <td className="px-4 py-2">{cat.name}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1 justify-end">
                                <Button size="icon" variant="ghost" className="h-7 w-7"
                                  onClick={() => { setEditingCat(cat); setShowCatForm(true); }}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeleteCatId(cat.id)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Type Form Dialog */}
      <Dialog open={showTypeForm} onOpenChange={o => !o && setShowTypeForm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingType ? "Edit Asset Type" : "Add Asset Type"}</DialogTitle>
            <DialogDescription>Asset types are the top-level classification for equipment.</DialogDescription>
          </DialogHeader>
          <AssetTypeForm onClose={() => setShowTypeForm(false)} editing={editingType} />
        </DialogContent>
      </Dialog>

      {/* Category Form Dialog */}
      <Dialog open={showCatForm} onOpenChange={o => !o && setShowCatForm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCat ? "Edit Category" : "Add Category"}</DialogTitle>
            <DialogDescription>Categories belong to a specific asset type.</DialogDescription>
          </DialogHeader>
          <AssetCategoryForm onClose={() => setShowCatForm(false)} editing={editingCat} types={types} defaultTypeId={catDefaultTypeId} />
        </DialogContent>
      </Dialog>

      {/* Delete Type Confirm */}
      <AlertDialog open={!!deleteTypeId} onOpenChange={o => !o && setDeleteTypeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete asset type?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the type. It cannot be deleted if it has categories or assets.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTypeId && doDeleteType(deleteTypeId)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Category Confirm */}
      <AlertDialog open={!!deleteCatId} onOpenChange={o => !o && setDeleteCatId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the category. It cannot be deleted if assets are using it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteCatId && doDeleteCat(deleteCatId)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
