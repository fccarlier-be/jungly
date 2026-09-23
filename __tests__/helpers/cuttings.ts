import { db } from "@/server/db";
import { createListing } from "@/server/cuttings/service";
import { setPseudo } from "@/server/cuttings/pseudo";

/** Comptes de test avec pseudo (sinon publier/ecrire est refuse) -- pseudos uniques par `suffix`. */
export async function createMember(label: string, suffix: number | string, opts: { isAdmin?: boolean } = {}): Promise<string> {
  const user = await db.user.create({
    data: { email: `cutting-${label}-${suffix}@example.com`, passwordHash: "x", isAdmin: opts.isAdmin ?? false },
  });
  await setPseudo(user.id, `${label} ${suffix}`);
  return user.id;
}

export async function newListing(userId: string, overrides: { title?: string; quantity?: number } = {}) {
  const filename = `${crypto.randomUUID()}.jpg`;
  await db.upload.create({ data: { filename, userId } });
  return createListing(userId, {
    title: overrides.title ?? "Bouture",
    type: "DON",
    quantity: overrides.quantity ?? 1,
    photoUrls: [`/uploads/${filename}`],
    noSaleAccepted: true,
  });
}

export async function deleteMembers(ids: string[]): Promise<void> {
  await db.cuttingReport.deleteMany({ where: { OR: [{ reporterId: { in: ids } }, { reportedUserId: { in: ids } }] } });
  await db.cuttingListing.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}
