import { db } from "@/server/db";
import { ForbiddenError } from "@/lib/errors";

/** Fin de la suspension du don/echange en cours pour ce compte, ou null (jamais suspendu, ou suspension echue). */
export async function getCuttingsBanUntil(userId: string): Promise<Date | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { cuttingsBannedUntil: true } });
  const until = user?.cuttingsBannedUntil ?? null;
  return until && until.getTime() > Date.now() ? until : null;
}

export function banMessage(until: Date): string {
  return `Tu es suspendu du don/échange de boutures jusqu'au ${until.toLocaleDateString("fr-BE")}.`;
}

export async function assertCuttingsAccess(userId: string): Promise<void> {
  const until = await getCuttingsBanUntil(userId);
  if (until) {
    throw new ForbiddenError(banMessage(until));
  }
}
