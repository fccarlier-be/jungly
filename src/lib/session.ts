import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

export class UnauthorizedError extends Error {
  constructor() {
    super("Non authentifié.");
  }
}

/** À utiliser dans les route handlers API : lève UnauthorizedError si non connecté. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }
  return session.user.id;
}

/**
 * À utiliser dans les Server Components (pages) : redirige vers /login si
 * non connecté, au lieu de planter sur un session!.user.id. Le middleware
 * fait déjà ce filtrage en amont, mais on ne s'y fie jamais entièrement
 * (défense en profondeur).
 */
export async function requireSessionUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session.user.id;
}
