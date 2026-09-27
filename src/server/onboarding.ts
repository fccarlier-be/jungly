import { db } from "@/server/db";

/**
 * Presentation guidee de premier lancement (voir OnboardingTour.tsx) : ne se
 * joue automatiquement qu'une fois dans la vie du compte (onboardingCompletedAt
 * null). Rejouable ensuite a la demande depuis Parametres, qui appelle la
 * meme route de completion sans consequence (idempotent).
 */
export async function needsOnboarding(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { onboardingCompletedAt: true } });
  return user?.onboardingCompletedAt == null;
}

export async function completeOnboarding(userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { onboardingCompletedAt: new Date() } });
}
