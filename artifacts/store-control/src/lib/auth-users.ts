import { db, type User, generateId, now } from "./db";

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const inputHash = await hashPassword(password);
  return inputHash === hash;
}

export async function createUser(input: {
  username: string;
  fullName: string;
  password: string;
  role: "admin" | "staff";
}) {
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
  return user;
}

export async function updateUserPassword(userId: string, newPassword: string) {
  const hash = await hashPassword(newPassword);
  await db.users.update(userId, { passwordHash: hash, updatedAt: now() });
}

export async function listUsers(): Promise<Omit<User, "passwordHash">[]> {
  const users = await db.users.toArray();
  return users.map(({ passwordHash: _ph, ...u }) => u);
}

export async function deleteUser(id: string) {
  await db.users.delete(id);
}

export async function ensureDefaultAdmin() {
  const count = await db.users.count();
  if (count === 0) {
    const hash = await hashPassword("admin123");
    await db.users.add({
      id: generateId(),
      username: "admin",
      fullName: "Administrator",
      passwordHash: hash,
      role: "admin",
      createdAt: now(),
      updatedAt: now(),
    });
  }
}
