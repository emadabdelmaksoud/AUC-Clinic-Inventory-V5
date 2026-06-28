import { db, type ExternalCustodian, generateId, now } from "./db";

export type { ExternalCustodian };

export async function listExternalCustodians(): Promise<ExternalCustodian[]> {
  const all = await db.externalCustodians.toArray();
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function upsertExternalCustodian(data: {
  name: string;
  phone?: string | null;
  email?: string | null;
  idNumber?: string | null;
  department?: string | null;
  notes?: string | null;
}): Promise<ExternalCustodian> {
  const name = data.name.trim();
  if (!name) throw new Error("Name is required");

  const all = await db.externalCustodians.toArray();
  const existing = all.find(c => c.name.toLowerCase() === name.toLowerCase());

  if (existing) {
    const updated: ExternalCustodian = {
      ...existing,
      phone: data.phone?.trim() || existing.phone,
      email: data.email?.trim() || existing.email,
      idNumber: data.idNumber?.trim() || existing.idNumber,
      department: data.department?.trim() || existing.department,
      notes: data.notes?.trim() || existing.notes,
      updatedAt: now(),
    };
    await db.externalCustodians.put(updated);
    return updated;
  }

  const created: ExternalCustodian = {
    id: generateId(),
    name,
    phone: data.phone?.trim() || null,
    email: data.email?.trim() || null,
    idNumber: data.idNumber?.trim() || null,
    department: data.department?.trim() || null,
    notes: data.notes?.trim() || null,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.externalCustodians.add(created);
  return created;
}

export async function saveExternalCustodianFromAsset(asset: {
  custodianType?: string | null;
  custodianName?: string | null;
  custodianPhone?: string | null;
  custodianEmail?: string | null;
  custodianIdNumber?: string | null;
}): Promise<void> {
  if (asset.custodianType !== "external_staff" || !asset.custodianName?.trim()) return;
  try {
    await upsertExternalCustodian({
      name: asset.custodianName,
      phone: asset.custodianPhone,
      email: asset.custodianEmail,
      idNumber: asset.custodianIdNumber,
    });
  } catch {
    // non-blocking
  }
}

export async function updateExternalCustodian(
  id: string,
  data: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    idNumber?: string | null;
    department?: string | null;
    notes?: string | null;
  }
): Promise<void> {
  const existing = await db.externalCustodians.get(id);
  if (!existing) throw new Error("External custodian not found");
  await db.externalCustodians.put({ ...existing, ...data, updatedAt: now() });
}

export async function deleteExternalCustodian(id: string): Promise<void> {
  await db.externalCustodians.delete(id);
}
