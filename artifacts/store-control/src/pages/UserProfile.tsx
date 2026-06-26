import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listUsers, updateUserProfile, changeOwnPassword, updateUserPassword } from "@/lib/auth";
import { listAssetsByUserId, listAssetTransactionsByUser, listAssetTypes, listAssetCategories } from "@/lib/assets";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Briefcase, Clock, Crown, Edit2, Eye, EyeOff, KeyRound, Save, ShieldCheck, User, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/permissions";
import { can, canManageUser, isSuperAdmin } from "@/lib/permissions";
import { StatusBadge } from "./Assets";
import { toast } from "sonner";

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
  if (role === "administrator") {
    return (
      <Badge className="text-xs gap-1 bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 hover:bg-purple-100">
        <Crown className="w-3 h-3" /> Administrator
      </Badge>
    );
  }
  if (role === "admin") {
    return (
      <Badge variant="default" className="text-xs gap-1">
        <ShieldCheck className="w-3 h-3" /> Admin
      </Badge>
    );
  }
  return <Badge variant="secondary" className="capitalize text-xs">{role}</Badge>;
}

function Initials({ name, size = "lg" }: { name: string; size?: "lg" | "xl" }) {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return (
    <div className={cn(
      "rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0",
      size === "xl" ? "w-20 h-20 text-2xl" : "w-16 h-16 text-xl"
    )}>
      {letters}
    </div>
  );
}

// ── Edit Profile Form ─────────────────────────────────────────────────────────

function EditProfileForm({
  profileUser,
  actorRole,
  isOwnProfile,
  onClose,
}: {
  profileUser: { id: string; fullName: string; username: string; role: string };
  actorRole: AppRole;
  isOwnProfile: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(profileUser.fullName);
  const [role, setRole] = useState<AppRole>(profileUser.role as AppRole);
  const [saving, setSaving] = useState(false);

  const canChangeRole = !isOwnProfile && canManageUser(actorRole, profileUser.role as AppRole);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) { toast.error("Full name is required"); return; }
    setSaving(true);
    try {
      const updates: { fullName?: string; role?: AppRole } = {};
      if (fullName.trim() !== profileUser.fullName) updates.fullName = fullName;
      if (canChangeRole && role !== profileUser.role) updates.role = role;
      if (Object.keys(updates).length === 0) { toast.info("No changes to save"); setSaving(false); return; }
      await updateUserProfile(profileUser.id, updates, actorRole);
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Full Name *</Label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Enter full name" />
      </div>
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
              {isSuperAdmin(actorRole) && (
                <SelectItem value="administrator">Administrator (Super Admin)</SelectItem>
              )}
              <SelectItem value="admin">Admin (full access)</SelectItem>
              <SelectItem value="staff">Staff (limited access)</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Input value={profileUser.role} disabled className="bg-muted/50 text-muted-foreground capitalize" />
        )}
        {isOwnProfile && <p className="text-xs text-muted-foreground">You cannot change your own role.</p>}
      </div>
      <div className="flex justify-end gap-2 pt-1">
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
  profileUser,
  actorRole,
  isOwnProfile,
  onClose,
}: {
  profileUser: { id: string; fullName: string; username: string; role: string };
  actorRole: AppRole;
  isOwnProfile: boolean;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  const canAdminReset = !isOwnProfile && can(actorRole, "users", "manage") &&
    canManageUser(actorRole, profileUser.role as AppRole);

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
      setCurrent(""); setNewPw(""); setConfirm("");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSaving(false);
  }

  if (!isOwnProfile && !canAdminReset) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isOwnProfile && (
        <div className="space-y-1.5">
          <Label>Current Password *</Label>
          <div className="relative">
            <Input
              type={showPw ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required className="pr-10" placeholder="Your current password"
            />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPw(v => !v)}>
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>New Password *</Label>
        <div className="relative">
          <Input
            type={showPw ? "text" : "password"}
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            required minLength={6} className="pr-10" placeholder="At least 6 characters"
          />
          {!isOwnProfile && (
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPw(v => !v)}>
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Minimum 6 characters.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Confirm Password *</Label>
        <Input
          type={showPw ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required minLength={6} placeholder="Repeat the password"
        />
        {confirm && newPw !== confirm && <p className="text-xs text-destructive">Passwords do not match</p>}
      </div>
      <div className="flex justify-end gap-2 pt-1">
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

  const { data: allUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
  });

  const { data: assets = [], isLoading: loadingAssets } = useQuery({
    queryKey: ["assetsByUser", userId],
    queryFn: () => listAssetsByUserId(userId),
    enabled: !!userId,
  });

  const { data: activity = [], isLoading: loadingActivity } = useQuery({
    queryKey: ["assetTransactionsByUser", userId],
    queryFn: () => listAssetTransactionsByUser(userId),
    enabled: !!userId,
  });

  const { data: types = [] } = useQuery({ queryKey: ["assetTypes"], queryFn: listAssetTypes });
  const { data: categories = [] } = useQuery({ queryKey: ["assetCategories"], queryFn: () => listAssetCategories() });

  const profileUser = allUsers.find(u => u.id === userId);

  if (loadingUsers) {
    return (
      <div className="space-y-4 max-w-3xl">
        <div className="h-8 w-40 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div className="max-w-3xl space-y-4">
        <Link href="/users">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
            <ArrowLeft className="w-4 h-4" /> Back to Users
          </Button>
        </Link>
        <div className="text-center py-16 text-muted-foreground">
          <User className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">User not found</p>
        </div>
      </div>
    );
  }

  const typeMap = Object.fromEntries(types.map(t => [t.id, t.name]));
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const isCurrentUser = currentUser?.id === profileUser.id;
  const actorRole = currentUser?.role as AppRole;
  const actorCanManage = canManageUser(actorRole, profileUser.role as AppRole);
  const canEditProfile = isCurrentUser || (can(actorRole, "users", "manage") && actorCanManage);
  const canChangePassword = isCurrentUser || (can(actorRole, "users", "manage") && actorCanManage);
  const activeAssets = assets.filter(a => a.status === "active");

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back */}
      <Link href="/users">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
          <ArrowLeft className="w-4 h-4" /> Back to Users
        </Button>
      </Link>

      {/* Header card */}
      <Card>
        <CardContent className="pt-6 pb-5">
          <div className="flex items-start gap-5">
            <Initials name={profileUser.fullName || profileUser.username} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">{profileUser.fullName || profileUser.username}</h1>
                {isCurrentUser && <Badge variant="outline" className="text-xs">You</Badge>}
              </div>
              <p className="text-sm text-muted-foreground font-mono mt-0.5">@{profileUser.username}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <RoleBadge role={profileUser.role} />
                <span className="text-xs text-muted-foreground">
                  Member since {format(new Date(profileUser.createdAt), "MMM d, yyyy")}
                </span>
              </div>
            </div>
            {canEditProfile && editMode === null && (
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => setEditMode("profile")}>
                  <Edit2 className="w-3.5 h-3.5" /> Edit Profile
                </Button>
                {canChangePassword && (
                  <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => setEditMode("password")}>
                    <KeyRound className="w-3.5 h-3.5" /> Change Password
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Profile form */}
      {editMode === "profile" && canEditProfile && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2"><Edit2 className="w-4 h-4" /> Edit Profile</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditMode(null)}>
                <X className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EditProfileForm
              profileUser={profileUser}
              actorRole={actorRole}
              isOwnProfile={isCurrentUser}
              onClose={() => { setEditMode(null); qc.invalidateQueries({ queryKey: ["users"] }); }}
            />
          </CardContent>
        </Card>
      )}

      {/* Change Password form */}
      {editMode === "password" && canChangePassword && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> Change Password</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditMode(null)}>
                <X className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm
              profileUser={profileUser}
              actorRole={actorRole}
              isOwnProfile={isCurrentUser}
              onClose={() => setEditMode(null)}
            />
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active Assets", value: activeAssets.length, icon: <Briefcase className="w-5 h-5" />, color: "text-green-600" },
          { label: "Total Assigned", value: assets.length, icon: <Briefcase className="w-5 h-5" />, color: "text-primary" },
          { label: "Activity Log", value: activity.length, icon: <Clock className="w-5 h-5" />, color: "text-purple-600" },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4 flex flex-col items-center text-center gap-1">
              <span className={cn("opacity-60", stat.color)}>{stat.icon}</span>
              <span className="text-2xl font-bold">{stat.value}</span>
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="assets">
        <TabsList className="w-full">
          <TabsTrigger value="assets" className="flex-1">
            <Briefcase className="w-3.5 h-3.5 mr-1.5" />
            Current Assets {assets.length > 0 && `(${assets.length})`}
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex-1">
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
                    <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Assigned</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {assets.map(asset => (
                    <tr key={asset.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium">{asset.assetName}</p>
                        {asset.serialNumber && <p className="text-xs text-muted-foreground">S/N: {asset.serialNumber}</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-sm">
                        <p>{typeMap[asset.assetTypeId] ?? "—"}</p>
                        {asset.assetCategoryId && <p className="text-xs text-muted-foreground">{catMap[asset.assetCategoryId] ?? ""}</p>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground space-y-0.5">
                        {asset.fyNumber && <p>FY: {asset.fyNumber}</p>}
                        {asset.faNumber && <p>FA: {asset.faNumber}</p>}
                        {asset.ccNumber && <p>CC: {asset.ccNumber}</p>}
                        {!asset.fyNumber && !asset.faNumber && !asset.ccNumber && <span>—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={asset.status} />
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                        {asset.custodianAssignmentDate
                          ? format(new Date(asset.custodianAssignmentDate), "dd MMM yyyy")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Activity Log ── */}
        <TabsContent value="activity" className="mt-4">
          {loadingActivity ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}</div>
          ) : activity.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm font-medium">No activity recorded yet</p>
              <p className="text-xs mt-1">Asset actions performed by this user will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activity.map(tx => (
                <div key={tx.id} className="flex gap-3 p-3 rounded-lg border bg-card text-sm">
                  <Clock className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-snug">{tx.summary}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(tx.createdAt), "dd MMM yyyy, HH:mm")}
                    </p>
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
