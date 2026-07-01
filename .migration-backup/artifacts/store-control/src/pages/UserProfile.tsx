import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listUsers, updateUserProfile, changeOwnPassword, updateUserPassword,
  type UserProfileUpdate,
} from "@/lib/auth";
import { listAssetsByUserId, listAssetTransactionsByUser, listAssetTypes, listAssetCategories } from "@/lib/assets";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ArrowLeft, Briefcase, Building2, Calendar, CheckCircle2, Clock, Crown,
  Edit2, Eye, EyeOff, KeyRound, Mail, Phone, Save, Upload,
  ShieldCheck, User, UserCircle, X, XCircle, Hash, Layers,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/permissions";
import { can, canManageUser, isSuperAdmin } from "@/lib/permissions";
import { StatusBadge } from "./Assets";
import { toast } from "sonner";

// ── Photo Crop Utilities ──────────────────────────────────────────────────────

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => resolve(e.target!.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function cropCircleToBase64(
  src: string,
  offsetX: number,
  offsetY: number,
  scale: number,
  naturalW: number,
  naturalH: number,
  size = 256,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      const drawW = naturalW * scale;
      const drawH = naturalH * scale;
      const x = size / 2 + offsetX - drawW / 2;
      const y = size / 2 + offsetY - drawH / 2;
      ctx.drawImage(img, x, y, drawW, drawH);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = reject;
    img.src = src;
  });
}

// ── Photo Crop Modal ──────────────────────────────────────────────────────────

const CROP_SIZE = 240;

function PhotoCropModal({
  src, onApply, onCancel,
}: { src: string; onApply: (dataUrl: string) => void; onCancel: () => void }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [applying, setApplying] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);

  const initScale = useCallback((w: number, h: number) => {
    const fit = Math.max(CROP_SIZE / w, CROP_SIZE / h);
    setScale(Math.max(fit, 1));
    setOffset({ x: 0, y: 0 });
    setNaturalSize({ w, h });
  }, []);

  const clampOffset = useCallback((ox: number, oy: number, sc: number, nw: number, nh: number) => {
    const hw = (nw * sc) / 2;
    const hh = (nh * sc) / 2;
    const hr = CROP_SIZE / 2;
    return {
      x: Math.min(hw - hr, Math.max(-(hw - hr), ox)),
      y: Math.min(hh - hr, Math.max(-(hh - hr), oy)),
    };
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  }, [offset]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.ox + dx, dragRef.current.oy + dy, scale, naturalSize.w, naturalSize.h));
  }, [scale, naturalSize, clampOffset]);

  const onMouseUp = useCallback(() => { dragRef.current = null; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale(prev => {
      const minS = Math.max(CROP_SIZE / naturalSize.w, CROP_SIZE / naturalSize.h, 0.1);
      const next = Math.min(Math.max(prev * (1 - e.deltaY * 0.001), minS), 10);
      setOffset(o => clampOffset(o.x, o.y, next, naturalSize.w, naturalSize.h));
      return next;
    });
  }, [naturalSize, clampOffset]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      dragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, ox: offset.x, oy: offset.y };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), scale };
    }
  }, [offset, scale]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && dragRef.current) {
      const dx = e.touches[0].clientX - dragRef.current.startX;
      const dy = e.touches[0].clientY - dragRef.current.startY;
      setOffset(clampOffset(dragRef.current.ox + dx, dragRef.current.oy + dy, scale, naturalSize.w, naturalSize.h));
    } else if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const minS = Math.max(CROP_SIZE / naturalSize.w, CROP_SIZE / naturalSize.h, 0.1);
      const next = Math.min(Math.max(pinchRef.current.scale * (dist / pinchRef.current.dist), minS), 10);
      setScale(next);
      setOffset(o => clampOffset(o.x, o.y, next, naturalSize.w, naturalSize.h));
    }
  }, [scale, naturalSize, clampOffset]);

  const onTouchEnd = useCallback(() => {
    dragRef.current = null;
    pinchRef.current = null;
  }, []);

  const onSliderChange = useCallback((v: number) => {
    const minS = naturalSize.w > 0 ? Math.max(CROP_SIZE / naturalSize.w, CROP_SIZE / naturalSize.h, 0.1) : 0.1;
    const next = minS + (10 - minS) * v;
    setScale(next);
    setOffset(o => clampOffset(o.x, o.y, next, naturalSize.w, naturalSize.h));
  }, [naturalSize, clampOffset]);

  const minS = naturalSize.w > 0 ? Math.max(CROP_SIZE / naturalSize.w, CROP_SIZE / naturalSize.h, 0.1) : 0.1;
  const sliderVal = naturalSize.w > 0 ? (scale - minS) / (10 - minS) : 0;

  async function apply() {
    setApplying(true);
    try {
      const dataUrl = await cropCircleToBase64(src, offset.x, offset.y, scale, naturalSize.w, naturalSize.h, 256);
      onApply(dataUrl);
    } catch {
      toast.error("Failed to crop image");
    }
    setApplying(false);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust Photo</DialogTitle>
          <DialogDescription>Drag to reposition · scroll or slider to zoom</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 pt-1">
          {/* Circular crop viewport */}
          <div
            className="rounded-full overflow-hidden border-2 border-primary bg-muted select-none cursor-grab active:cursor-grabbing touch-none"
            style={{ width: CROP_SIZE, height: CROP_SIZE, position: "relative" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <img
              src={src}
              alt="crop"
              draggable={false}
              onLoad={(e) => {
                const img = e.target as HTMLImageElement;
                initScale(img.naturalWidth, img.naturalHeight);
              }}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
                transformOrigin: "center",
                pointerEvents: "none",
                userSelect: "none",
                maxWidth: "none",
              }}
            />
          </div>

          {/* Zoom slider */}
          <div className="flex items-center gap-2 w-full px-2">
            <span className="text-xs text-muted-foreground select-none">−</span>
            <input
              type="range" min={0} max={1} step={0.001}
              value={sliderVal}
              onChange={(e) => onSliderChange(parseFloat(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="text-xs text-muted-foreground select-none">+</span>
          </div>

          <div className="flex gap-2 w-full">
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" className="flex-1" onClick={apply} disabled={applying || naturalSize.w === 0}>
              {applying ? "Applying…" : "Apply"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function RoleBadge({ role }: { role: string }) {
  if (role === "administrator") return (
    <Badge className="text-xs gap-1 bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 hover:bg-purple-100">
      <Crown className="w-3 h-3" /> Administrator
    </Badge>
  );
  if (role === "admin") return (
    <Badge variant="default" className="text-xs gap-1">
      <ShieldCheck className="w-3 h-3" /> Admin
    </Badge>
  );
  return <Badge variant="secondary" className="capitalize text-xs">{role}</Badge>;
}

function StatusBadgeUser({ status }: { status?: string }) {
  if (!status || status === "active") return (
    <Badge className="text-xs gap-1 bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
      <CheckCircle2 className="w-3 h-3" /> Active
    </Badge>
  );
  return (
    <Badge className="text-xs gap-1 bg-red-100 text-red-800 border-red-200 hover:bg-red-100">
      <XCircle className="w-3 h-3" /> Inactive
    </Badge>
  );
}

function Avatar({ name, photoUrl, size = "lg" }: { name: string; photoUrl?: string; size?: "lg" | "xl" }) {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  const dim = size === "xl" ? "w-24 h-24 text-3xl" : "w-16 h-16 text-xl";
  if (photoUrl) return (
    <img src={photoUrl} alt={name}
      className={cn(dim, "rounded-full object-cover flex-shrink-0 border-2 border-border")}
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
  return (
    <div className={cn(dim, "rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0")}>
      {letters}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-b-0">
      <Icon className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className={cn("text-sm mt-0.5 break-words", !value && "text-muted-foreground italic")}>{value || "Not set"}</p>
      </div>
    </div>
  );
}

// ── Edit Profile Form ─────────────────────────────────────────────────────────

type ProfileUser = {
  id: string; fullName: string; username: string; role: string;
  status?: string; employeeId?: string; email?: string; department?: string;
  position?: string; phone?: string; photoUrl?: string;
};

function EditProfileForm({
  profileUser, actorRole, isOwnProfile, onClose,
}: {
  profileUser: ProfileUser; actorRole: AppRole; isOwnProfile: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { refreshUser } = useAuth();
  const [fullName, setFullName] = useState(profileUser.fullName || "");
  const [employeeId, setEmployeeId] = useState(profileUser.employeeId || "");
  const [email, setEmail] = useState(profileUser.email || "");
  const [phone, setPhone] = useState(profileUser.phone || "");
  const [department, setDepartment] = useState(profileUser.department || "");
  const [position, setPosition] = useState(profileUser.position || "");
  const [photoUrl, setPhotoUrl] = useState(profileUser.photoUrl || "");
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [role, setRole] = useState<AppRole>(profileUser.role as AppRole);
  const [status, setStatus] = useState<"active" | "inactive">((profileUser.status as "active" | "inactive") || "active");
  const [saving, setSaving] = useState(false);

  const canChangeRole = !isOwnProfile && canManageUser(actorRole, profileUser.role as AppRole);
  const canChangeStatus = can(actorRole, "users", "manage");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) { toast.error("Full name is required"); return; }
    setSaving(true);
    try {
      const updates: UserProfileUpdate = {
        fullName, employeeId, email, phone, department, position, photoUrl,
        ...(canChangeStatus ? { status } : {}),
        ...(canChangeRole ? { role } : {}),
      };
      await updateUserProfile(profileUser.id, updates, actorRole);
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["users"] });
      if (isOwnProfile) await refreshUser();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {/* Personal Information */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Personal Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Full Name *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Enter full name" />
          </div>
          <div className="space-y-1.5">
            <Label>Employee ID</Label>
            <Input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="e.g. EMP-001" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="employee@clinic.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone Number</Label>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 234 567 8900" />
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Radiology, ICU" />
          </div>
          <div className="space-y-1.5">
            <Label>Position / Job Title</Label>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Head Nurse" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Profile Photo <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <div className="flex items-center gap-3">
              {/* Preview circle */}
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-border">
                {photoUrl ? (
                  <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-bold text-primary">
                    {(() => {
                      const parts = (fullName || profileUser.username).trim().split(/\s+/);
                      return parts.length >= 2
                        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                        : (fullName || profileUser.username).slice(0, 2).toUpperCase();
                    })()}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="cursor-pointer">
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = "";
                      try {
                        const src = await readFileAsDataUrl(file);
                        setCropSrc(src);
                      } catch {
                        toast.error("Failed to read image");
                      }
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 pointer-events-none">
                    <Upload className="w-3.5 h-3.5" /> {photoUrl ? "Change Photo" : "Upload Photo"}
                  </Button>
                </label>
                {photoUrl && (
                  <>
                    <Button type="button" variant="outline" size="sm" className="gap-1.5"
                      onClick={() => setCropSrc(photoUrl)}>
                      <Edit2 className="w-3.5 h-3.5" /> Adjust
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive text-xs h-7"
                      onClick={() => setPhotoUrl("")}>
                      Remove photo
                    </Button>
                  </>
                )}
                <p className="text-xs text-muted-foreground">Drag · scroll to zoom · pinch on mobile</p>
              </div>
            </div>
          </div>

          {/* Crop modal */}
          {cropSrc && (
            <PhotoCropModal
              src={cropSrc}
              onApply={(dataUrl) => { setPhotoUrl(dataUrl); setCropSrc(null); }}
              onCancel={() => setCropSrc(null)}
            />
          )}
        </div>
      </div>

      {/* Account Settings */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Account Settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input value={profileUser.username} disabled className="bg-muted/50 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Username cannot be changed.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            {canChangeRole ? (
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isSuperAdmin(actorRole) && <SelectItem value="administrator">Administrator (Super Admin)</SelectItem>}
                  <SelectItem value="admin">Admin (full access)</SelectItem>
                  <SelectItem value="staff">Staff (limited access)</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <>
                <Input value={profileUser.role} disabled className="bg-muted/50 text-muted-foreground capitalize" />
                {isOwnProfile && <p className="text-xs text-muted-foreground">You cannot change your own role.</p>}
              </>
            )}
          </div>
          {canChangeStatus && (
            <div className="space-y-1.5">
              <Label>Account Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "active" | "inactive")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1 border-t">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving} className="gap-1.5">
          <Save className="w-3.5 h-3.5" /> {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

// ── Change Password Form ──────────────────────────────────────────────────────

function ChangePasswordForm({
  profileUser, actorRole, isOwnProfile, onClose,
}: {
  profileUser: ProfileUser; actorRole: AppRole; isOwnProfile: boolean; onClose: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (newPw !== confirm) { toast.error("Passwords do not match"); return; }
    setSaving(true);
    try {
      if (isOwnProfile) {
        await changeOwnPassword(profileUser.id, current, newPw);
      } else {
        await updateUserPassword(profileUser.id, newPw, actorRole);
      }
      toast.success("Password updated");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isOwnProfile && (
        <div className="space-y-1.5">
          <Label>Current Password *</Label>
          <div className="relative">
            <Input type={showPw ? "text" : "password"} value={current}
              onChange={(e) => setCurrent(e.target.value)} required className="pr-10" placeholder="Your current password" />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>New Password *</Label>
          <div className="relative">
            <Input type={showPw ? "text" : "password"} value={newPw}
              onChange={(e) => setNewPw(e.target.value)} required minLength={6} className="pr-10" placeholder="At least 6 characters" />
            {!isOwnProfile && (
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Minimum 6 characters.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Confirm Password *</Label>
          <Input type={showPw ? "text" : "password"} value={confirm}
            onChange={(e) => setConfirm(e.target.value)} required minLength={6} placeholder="Repeat the password" />
          {confirm && newPw !== confirm && <p className="text-xs text-destructive">Passwords do not match</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1 border-t">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving || (!!confirm && newPw !== confirm)} className="gap-1.5">
          <KeyRound className="w-3.5 h-3.5" /> {saving ? "Updating..." : "Update Password"}
        </Button>
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UserProfilePage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState<"profile" | "password" | null>(null);
  const [activityFilter, setActivityFilter] = useState<string>("all");

  const { data: allUsers = [], isLoading: loadingUsers } = useQuery({ queryKey: ["users"], queryFn: listUsers });
  const { data: assets = [], isLoading: loadingAssets } = useQuery({
    queryKey: ["assetsByUser", userId], queryFn: () => listAssetsByUserId(userId), enabled: !!userId,
  });
  const { data: activity = [], isLoading: loadingActivity } = useQuery({
    queryKey: ["assetTransactionsByUser", userId], queryFn: () => listAssetTransactionsByUser(userId), enabled: !!userId,
  });
  const { data: types = [] } = useQuery({ queryKey: ["assetTypes"], queryFn: listAssetTypes });
  const { data: categories = [] } = useQuery({ queryKey: ["assetCategories"], queryFn: () => listAssetCategories() });

  const profileUser = allUsers.find(u => u.id === userId);

  if (loadingUsers) return (
    <div className="space-y-4 w-full">
      <div className="h-8 w-40 bg-muted animate-pulse rounded" />
      <div className="h-48 bg-muted animate-pulse rounded-xl" />
      <div className="h-32 bg-muted animate-pulse rounded-xl" />
    </div>
  );

  if (!profileUser) return (
    <div className="w-full space-y-4">
      <Link href="/users"><Button variant="ghost" size="sm" className="gap-1.5 -ml-2"><ArrowLeft className="w-4 h-4" /> Back to Users</Button></Link>
      <div className="text-center py-16 text-muted-foreground">
        <User className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p className="font-medium">User not found</p>
      </div>
    </div>
  );

  const typeMap = Object.fromEntries(types.map(t => [t.id, t.name]));
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const isCurrentUser = currentUser?.id === profileUser.id;
  const actorRole = currentUser?.role as AppRole;
  const actorCanManage = canManageUser(actorRole, profileUser.role as AppRole);
  const canEditProfile = isCurrentUser || (can(actorRole, "users", "manage") && actorCanManage);
  const canChangePassword = isCurrentUser || (can(actorRole, "users", "manage") && actorCanManage);
  const activeAssets = assets.filter(a => a.status === "active");
  const transfers = activity.filter(a => a.action === "custody_transferred");
  const filteredActivity = activityFilter === "all" ? activity : activity.filter(a => a.action === activityFilter);

  return (
    <div className="space-y-5 w-full">
      {/* Back */}
      <Link href="/users"><Button variant="ghost" size="sm" className="gap-1.5 -ml-2"><ArrowLeft className="w-4 h-4" /> Back to Users</Button></Link>

      {/* ── Header Card ── */}
      <Card>
        <CardContent className="pt-6 pb-5">
          <div className="flex items-start gap-4">
            <Avatar name={profileUser.fullName || profileUser.username} photoUrl={profileUser.photoUrl} size="xl" />
            <div className="flex-1 min-w-0">
              {/* Name row: title left, action buttons right — buttons drop below on mobile */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold break-words leading-tight">
                    {profileUser.fullName || profileUser.username}
                  </h1>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    {isCurrentUser && <Badge variant="outline" className="text-xs">You</Badge>}
                    <StatusBadgeUser status={profileUser.status} />
                  </div>
                </div>
                {canEditProfile && editMode === null && (
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs whitespace-nowrap" onClick={() => setEditMode("profile")}>
                      <Edit2 className="w-3.5 h-3.5" /> Edit Profile
                    </Button>
                    {canChangePassword && (
                      <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs whitespace-nowrap" onClick={() => setEditMode("password")}>
                        <KeyRound className="w-3.5 h-3.5" /> Change Password
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {profileUser.position && (
                <p className="text-sm text-muted-foreground mt-1.5 break-words">{profileUser.position}{profileUser.department ? ` · ${profileUser.department}` : ""}</p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <RoleBadge role={profileUser.role} />
                {profileUser.employeeId && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Hash className="w-3 h-3" />{profileUser.employeeId}</span>
                )}
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <UserCircle className="w-3 h-3" />@{profileUser.username}
                </span>
              </div>
              {(profileUser.email || profileUser.phone) && (
                <div className="flex gap-4 mt-2 flex-wrap">
                  {profileUser.email && <span className="text-xs text-muted-foreground flex items-center gap-1 break-all"><Mail className="w-3 h-3 flex-shrink-0" />{profileUser.email}</span>}
                  {profileUser.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3 flex-shrink-0" />{profileUser.phone}</span>}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Edit Profile Form ── */}
      {editMode === "profile" && canEditProfile && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2"><Edit2 className="w-4 h-4" /> Edit Profile</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditMode(null)}><X className="w-4 h-4" /></Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EditProfileForm profileUser={profileUser} actorRole={actorRole} isOwnProfile={isCurrentUser}
              onClose={() => { setEditMode(null); qc.invalidateQueries({ queryKey: ["users"] }); }} />
          </CardContent>
        </Card>
      )}

      {/* ── Change Password Form ── */}
      {editMode === "password" && canChangePassword && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> Change Password</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditMode(null)}><X className="w-4 h-4" /></Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm profileUser={profileUser} actorRole={actorRole} isOwnProfile={isCurrentUser}
              onClose={() => setEditMode(null)} />
          </CardContent>
        </Card>
      )}

      {/* ── Info Grid + Stats ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Contact & Account Details */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold">Profile Details</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x">
              <div className="pr-0 sm:pr-4">
                <InfoRow icon={Hash} label="Employee ID" value={profileUser.employeeId} />
                <InfoRow icon={Mail} label="Email" value={profileUser.email} />
                <InfoRow icon={Phone} label="Phone" value={profileUser.phone} />
                <InfoRow icon={Building2} label="Department" value={profileUser.department} />
                <InfoRow icon={Layers} label="Position / Job Title" value={profileUser.position} />
              </div>
              <div className="pl-0 sm:pl-4 pt-0">
                <InfoRow icon={UserCircle} label="Username" value={`@${profileUser.username}`} />
                <InfoRow icon={ShieldCheck} label="Role" value={profileUser.role.charAt(0).toUpperCase() + profileUser.role.slice(1)} />
                <InfoRow icon={CheckCircle2} label="Status" value={(profileUser.status || "active").charAt(0).toUpperCase() + (profileUser.status || "active").slice(1)} />
                <InfoRow icon={Calendar} label="Date Created" value={format(new Date(profileUser.createdAt), "dd MMM yyyy, HH:mm")} />
                <InfoRow icon={Clock} label="Last Login" value={profileUser.lastLogin ? format(new Date(profileUser.lastLogin), "dd MMM yyyy, HH:mm") : undefined} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="flex flex-col gap-3">
          {[
            { label: "Active Assets", value: activeAssets.length, icon: <Briefcase className="w-5 h-5" />, color: "text-green-600" },
            { label: "Total Assigned", value: assets.length, icon: <Briefcase className="w-5 h-5" />, color: "text-primary" },
            { label: "Transfers", value: transfers.length, icon: <Layers className="w-5 h-5" />, color: "text-purple-600" },
            { label: "Activity Log", value: activity.length, icon: <Clock className="w-5 h-5" />, color: "text-orange-500" },
          ].map(stat => (
            <Card key={stat.label}>
              <CardContent className="py-3 flex items-center gap-3">
                <span className={cn("opacity-60", stat.color)}>{stat.icon}</span>
                <div>
                  <p className="text-xl font-bold leading-none">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="assets">
        <TabsList className="w-full">
          <TabsTrigger value="assets" className="flex-1 text-xs">
            <Briefcase className="w-3.5 h-3.5 mr-1.5" />
            Current Assets {assets.length > 0 && `(${assets.length})`}
          </TabsTrigger>
          <TabsTrigger value="transfers" className="flex-1 text-xs">
            <Layers className="w-3.5 h-3.5 mr-1.5" />
            Asset Transfers {transfers.length > 0 && `(${transfers.length})`}
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex-1 text-xs">
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            Activity {activity.length > 0 && `(${activity.length})`}
          </TabsTrigger>
        </TabsList>

        {/* ── Current Assets ── */}
        <TabsContent value="assets" className="mt-4">
          {loadingAssets ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}</div>
          ) : assets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Briefcase className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm font-medium">No assets currently assigned</p>
              <p className="text-xs mt-1">Assets assigned to this user will appear here.</p>
            </div>
          ) : (
            <div className="rounded-lg border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Asset Name</th>
                    <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Type / Category</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Ref. Nos.</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Assigned Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {assets.map(asset => (
                    <tr key={asset.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium">{asset.assetName}</p>
                        {asset.serialNumber && <p className="text-xs text-muted-foreground">S/N: {asset.serialNumber}</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <p>{typeMap[asset.assetTypeId] ?? "—"}</p>
                        {asset.assetCategoryId && <p className="text-xs text-muted-foreground">{catMap[asset.assetCategoryId] ?? ""}</p>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground space-y-0.5">
                        {asset.fyNumber && <p>FY: {asset.fyNumber}</p>}
                        {asset.faNumber && <p>FA: {asset.faNumber}</p>}
                        {asset.ccNumber && <p>CC: {asset.ccNumber}</p>}
                        {!asset.fyNumber && !asset.faNumber && !asset.ccNumber && <span>—</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={asset.status} /></td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                        {asset.custodianAssignmentDate ? format(new Date(asset.custodianAssignmentDate), "dd MMM yyyy") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Asset Transfers ── */}
        <TabsContent value="transfers" className="mt-4">
          {transfers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Layers className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm font-medium">No custody transfers recorded</p>
              <p className="text-xs mt-1">Asset transfers involving this user will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transfers.map(tx => (
                <div key={tx.id} className="flex gap-3 p-3 rounded-lg border bg-card text-sm">
                  <Layers className="w-4 h-4 mt-0.5 text-purple-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-snug">{tx.summary}</p>
                    <p className="text-xs text-muted-foreground mt-1">{format(new Date(tx.createdAt), "dd MMM yyyy, HH:mm")}</p>
                  </div>
                  <Badge variant="outline" className="text-xs flex-shrink-0 bg-purple-100 text-purple-700 border-purple-200">Custody Transfer</Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Activity Log ── */}
        <TabsContent value="activity" className="mt-4">
          {/* Filter bar */}
          {activity.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-3">
              {["all", "created", "updated", "custody_transferred", "location_changed", "status_changed"].map(f => (
                <Button key={f} size="sm" variant={activityFilter === f ? "default" : "outline"}
                  className="h-7 text-xs" onClick={() => setActivityFilter(f)}>
                  {f === "all" ? "All" : ACTION_LABELS[f] ?? f}
                </Button>
              ))}
            </div>
          )}
          {loadingActivity ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}</div>
          ) : filteredActivity.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm font-medium">{activity.length === 0 ? "No activity recorded yet" : "No matching activity"}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredActivity.map(tx => (
                <div key={tx.id} className="flex gap-3 p-3 rounded-lg border bg-card text-sm">
                  <Clock className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-snug">{tx.summary}</p>
                    <p className="text-xs text-muted-foreground mt-1">{format(new Date(tx.createdAt), "dd MMM yyyy, HH:mm")}</p>
                  </div>
                  <Badge variant="outline" className={cn("text-xs flex-shrink-0", ACTION_COLORS[tx.action] ?? "")}>
                    {ACTION_LABELS[tx.action] ?? tx.action}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
