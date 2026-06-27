// @refresh reset
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { db, type User, generateId, now } from "./db";
import { addAuditLog } from "./audit";
import type { AppRole } from "./permissions";

// ── Password Hashing (PBKDF2-SHA256 with random salt) ────────────────────────
// Uses the Web Crypto API — no extra dependencies required.
// Stored format: "pbkdf2v1:<16-byte-salt-hex>:<32-byte-hash-hex>"
// Legacy format: plain 64-char SHA-256 hex (no prefix) — migrated on first login.

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;

function hexEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexDecode(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
}

async function pbkdf2Derive(password: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { name: "PBKDF2", salt: salt as any, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial, 256,
  );
  return hexEncode(bits);
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const saltHex = hexEncode(salt);
  const hash = await pbkdf2Derive(password, salt);
  return `pbkdf2v1:${saltHex}:${hash}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith("pbkdf2v1:")) {
    const parts = storedHash.split(":");
    if (parts.length !== 3) return false;
    const salt = hexDecode(parts[1]);
    const expected = parts[2];
    const actual = await pbkdf2Derive(password, salt);
    // Constant-time comparison to prevent timing attacks
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  }
  // Legacy path: plain SHA-256 without salt — kept only to migrate existing accounts
  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", enc.encode(password));
  const legacyHash = hexEncode(hashBuffer);
  if (legacyHash.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < legacyHash.length; i++) diff |= legacyHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  return diff === 0;
}

// ── Auth Context ──────────────────────────────────────────────────────────────

interface AuthCtx {
  user: Omit<User, "passwordHash"> | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

const SESSION_KEY = "store_control_session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Omit<User, "passwordHash"> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      await ensureDefaultAdmin();
      const sessionJson = localStorage.getItem(SESSION_KEY);
      if (sessionJson) {
        try {
          const session = JSON.parse(sessionJson);
          const dbUser = await db.users.get(session.id);
          if (dbUser) {
            const { passwordHash: _ph, ...safeUser } = dbUser;
            setUser(safeUser);
          } else {
            localStorage.removeItem(SESSION_KEY);
          }
        } catch {
          localStorage.removeItem(SESSION_KEY);
        }
      }
      setLoading(false);
    }
    init();
  }, []);

  const signIn = async (username: string, password: string) => {
    const dbUser = await db.users.where("username").equals(username.toLowerCase().trim()).first();
    if (!dbUser) return { error: "Invalid username or password" };
    const valid = await verifyPassword(password, dbUser.passwordHash);
    if (!valid) return { error: "Invalid username or password" };
    const loginTime = now();

    // Transparently upgrade legacy SHA-256 hashes to PBKDF2 on first successful login
    let updatedHash: string | undefined;
    if (!dbUser.passwordHash.startsWith("pbkdf2v1:")) {
      try {
        updatedHash = await hashPassword(password);
      } catch { /* best effort */ }
    }

    try {
      await db.users.update(dbUser.id, {
        lastLogin: loginTime,
        updatedAt: loginTime,
        ...(updatedHash ? { passwordHash: updatedHash } : {}),
      });
    } catch { /* best effort */ }

    const { passwordHash: _ph, ...safeUser } = { ...dbUser, lastLogin: loginTime };
    setUser(safeUser);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: dbUser.id }));

    addAuditLog({
      action: "LOGIN",
      tableName: "users",
      recordId: dbUser.id,
      userId: dbUser.id,
      changes: `User "${dbUser.username}" signed in.`,
    }).catch(() => {});

    return { error: null };
  };

  const signOut = () => {
    if (user) {
      addAuditLog({
        action: "LOGOUT",
        tableName: "users",
        recordId: user.id,
        userId: user.id,
        changes: `User "${user.username}" signed out.`,
      }).catch(() => {});
    }
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  };

  const refreshUser = async () => {
    if (!user) return;
    const dbUser = await db.users.get(user.id);
    if (dbUser) {
      const { passwordHash: _ph, ...safeUser } = dbUser;
      setUser(safeUser);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// ── Role helpers ──────────────────────────────────────────────────────────────

const ROLE_PRIORITY: Record<string, number> = {
  administrator: 3,
  admin: 2,
  staff: 1,
};

async function deduplicateUsernames() {
  const all = await db.users.toArray();
  const byUsername = new Map<string, typeof all>();
  for (const u of all) {
    const key = u.username.toLowerCase();
    if (!byUsername.has(key)) byUsername.set(key, []);
    byUsername.get(key)!.push(u);
  }
  for (const [, group] of byUsername) {
    if (group.length <= 1) continue;
    group.sort((a, b) => {
      const pa = ROLE_PRIORITY[a.role] ?? 0;
      const pb = ROLE_PRIORITY[b.role] ?? 0;
      if (pb !== pa) return pb - pa;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    const toDelete = group.slice(1);
    for (const u of toDelete) {
      await db.users.delete(u.id);
    }
  }
}

async function ensureDefaultAdmin() {
  await deduplicateUsernames();
  const count = await db.users.count();
  if (count === 0) {
    const hash = await hashPassword("admin123");
    await db.users.add({
      id: generateId(),
      username: "admin",
      fullName: "Administrator",
      passwordHash: hash,
      role: "administrator",
      createdAt: now(),
      updatedAt: now(),
    });
  } else {
    const existing = await db.users.where("username").equals("admin").first();
    if (existing && existing.role === "admin") {
      await db.users.update(existing.id, { role: "administrator", updatedAt: now() });
    }
  }
}

// ── User CRUD (exported) ──────────────────────────────────────────────────────

export async function createUser(
  input: {
    username: string;
    fullName: string;
    password: string;
    role: "administrator" | "admin" | "staff";
  },
  actorId?: string,
) {
  const existing = await db.users.where("username").equals(input.username.toLowerCase().trim()).first();
  if (existing) throw new Error("Username already taken");
  const hash = await hashPassword(input.password);
  const user: User = {
    id: generateId(),
    username: input.username.toLowerCase().trim(),
    fullName: input.fullName.trim(),
    passwordHash: hash,
    role: input.role,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.users.add(user);
  addAuditLog({
    action: "USER_CREATED",
    tableName: "users",
    recordId: user.id,
    userId: actorId ?? null,
    changes: `User "${user.username}" (${user.role}) created.`,
  }).catch(() => {});
  return user;
}

export async function updateUserPassword(
  userId: string,
  newPassword: string,
  actorRole?: AppRole,
  actorId?: string,
) {
  if (actorRole !== undefined && actorRole !== "administrator") {
    throw new Error("Access denied: Only administrators can reset other users' passwords.");
  }
  const target = await db.users.get(userId);
  if (target?.role === "administrator") {
    throw new Error("Administrator credentials can only be changed by the Administrator themselves.");
  }
  const hash = await hashPassword(newPassword);
  await db.users.update(userId, { passwordHash: hash, updatedAt: now() });
  addAuditLog({
    action: "PASSWORD_RESET",
    tableName: "users",
    recordId: userId,
    userId: actorId ?? null,
    changes: `Password for user "${target?.username}" was reset by an administrator.`,
  }).catch(() => {});
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const target = await db.users.get(userId);
  if (!target) throw new Error("User not found.");
  const valid = await verifyPassword(currentPassword, target.passwordHash);
  if (!valid) throw new Error("Current password is incorrect.");
  if (newPassword.length < 6) throw new Error("New password must be at least 6 characters.");
  const hash = await hashPassword(newPassword);
  await db.users.update(userId, { passwordHash: hash, updatedAt: now() });
  addAuditLog({
    action: "PASSWORD_CHANGED",
    tableName: "users",
    recordId: userId,
    userId,
    changes: `User "${target.username}" changed their own password.`,
  }).catch(() => {});
}

export async function listUsers(): Promise<Omit<User, "passwordHash">[]> {
  const users = await db.users.toArray();
  return users.map(({ passwordHash: _ph, ...u }) => u);
}

export interface UserProfileUpdate {
  fullName?: string;
  role?: AppRole;
  status?: "active" | "inactive";
  employeeId?: string;
  email?: string;
  department?: string;
  position?: string;
  phone?: string;
  photoUrl?: string;
}

export async function updateUserProfile(
  userId: string,
  updates: UserProfileUpdate,
  actorRole?: AppRole,
): Promise<void> {
  const target = await db.users.get(userId);
  if (!target) throw new Error("User not found.");
  if (updates.role !== undefined && updates.role !== target.role) {
    if (actorRole !== "administrator" && actorRole !== "admin") {
      throw new Error("Access denied: You cannot change roles.");
    }
    if (target.role === "administrator" || updates.role === "administrator") {
      if (actorRole !== "administrator") {
        throw new Error("Only the Administrator can assign or remove the Administrator role.");
      }
    }
  }
  const patch: Partial<User> = { updatedAt: now() };
  if (updates.fullName !== undefined) patch.fullName = updates.fullName.trim();
  if (updates.role !== undefined) patch.role = updates.role as AppRole;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.employeeId !== undefined) patch.employeeId = updates.employeeId.trim() || undefined;
  if (updates.email !== undefined) patch.email = updates.email.trim() || undefined;
  if (updates.department !== undefined) patch.department = updates.department.trim() || undefined;
  if (updates.position !== undefined) patch.position = updates.position.trim() || undefined;
  if (updates.phone !== undefined) patch.phone = updates.phone.trim() || undefined;
  if (updates.photoUrl !== undefined) patch.photoUrl = updates.photoUrl.trim() || undefined;
  await db.users.update(userId, patch);
}

export async function deleteUser(id: string, actorId?: string) {
  const target = await db.users.get(id);
  if (target?.role === "administrator") {
    throw new Error("Administrator accounts cannot be deleted.");
  }
  await db.users.delete(id);
  addAuditLog({
    action: "USER_DELETED",
    tableName: "users",
    recordId: id,
    userId: actorId ?? null,
    changes: `User "${target?.username}" was deleted.`,
  }).catch(() => {});
}
