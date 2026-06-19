import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listUsers, createUser, deleteUser, updateUserPassword } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Key, Users } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

function CreateUserForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createUser({ username, fullName, password, role });
      toast.success("User created");
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5"><Label>Username *</Label><Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="lowercase, no spaces" required data-testid="input-username" /></div>
      <div className="space-y-1.5"><Label>Full Name *</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} required data-testid="input-fullname" /></div>
      <div className="space-y-1.5"><Label>Password *</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} data-testid="input-password" /></div>
      <div className="space-y-1.5">
        <Label>Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as "admin" | "staff")}>
          <SelectTrigger data-testid="select-role"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin (full access)</SelectItem>
            <SelectItem value="staff">Staff (limited access)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving} data-testid="button-create-user">{saving ? "Creating..." : "Create User"}</Button>
      </div>
    </form>
  );
}

function ChangePasswordForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateUserPassword(userId, password);
      toast.success("Password changed");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSaving(false);
  }
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5"><Label>New Password *</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} data-testid="input-new-password" /></div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving} data-testid="button-change-pw">{saving ? "Saving..." : "Change Password"}</Button>
      </div>
    </form>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [changePwUser, setChangePwUser] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({ queryKey: ["users"], queryFn: listUsers });

  const { mutate: doDelete } = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => { toast.success("User deleted"); qc.invalidateQueries({ queryKey: ["users"] }); setDeleteId(null); },
    onError: (e) => toast.error((e as Error).message),
  });

  const canManage = can(currentUser?.role, "users", "manage");

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6" /> Users</h1>
          <p className="text-sm text-muted-foreground">{users.length} user{users.length !== 1 ? "s" : ""}</p>
        </div>
        {canManage && <Button onClick={() => setShowCreate(true)} data-testid="button-add-user"><Plus className="w-4 h-4 mr-1" /> Add User</Button>}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium">User</th>
              <th className="text-left px-4 py-3 font-medium">Username</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Created</th>
              {canManage && <th className="px-4 py-3" />}
            </tr></thead>
            <tbody className="divide-y">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-muted/30" data-testid={`user-row-${u.id}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.fullName}</div>
                    {u.id === currentUser?.id && <span className="text-xs text-primary">(You)</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{u.username}</td>
                  <td className="px-4 py-3"><Badge variant={u.role === "admin" ? "default" : "secondary"} className="capitalize text-xs">{u.role}</Badge></td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">{format(new Date(u.createdAt), "MMM d, yyyy")}</td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Change password" onClick={() => setChangePwUser(u.id)} data-testid={`button-changepw-${u.id}`}><Key className="w-3.5 h-3.5" /></Button>
                        {u.id !== currentUser?.id && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(u.id)} data-testid={`button-delete-${u.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent><DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
          <CreateUserForm onClose={() => setShowCreate(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!changePwUser} onOpenChange={(o) => !o && setChangePwUser(null)}>
        <DialogContent><DialogHeader><DialogTitle>Change Password</DialogTitle></DialogHeader>
          {changePwUser && <ChangePasswordForm userId={changePwUser} onClose={() => setChangePwUser(null)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete user?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && doDelete(deleteId)} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
