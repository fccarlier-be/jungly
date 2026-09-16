import { db } from "@/server/db";
import { sendEmail } from "@/lib/email";
import { NotFoundError, ConflictError } from "@/lib/errors";
import {
  confirmationRequestEmail,
  confirmedWelcomeEmail,
  waitlistedEmail,
  invitationEmail,
} from "@/server/betaSignup";

/**
 * Backend pour jungly-admin (service separe, voir docs/admin-panel.md) --
 * jamais appele directement par un navigateur, seulement via les routes
 * /api/internal/admin/* protegees par secret partage (src/lib/internalAuth.ts).
 */

export interface BetaSignupDetail {
  id: string;
  email: string;
  status: "PENDING" | "CONFIRMED" | "WAITLISTED";
  createdAt: string;
  confirmedAt: string | null;
  invitedAt: string | null;
}

export async function listBetaSignupsDetailed(): Promise<BetaSignupDetail[]> {
  const rows = await db.betaSignup.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
    invitedAt: r.invitedAt ? r.invitedAt.toISOString() : null,
  }));
}

export interface AccountSummary {
  email: string;
  name: string | null;
  createdAt: string;
  isAdmin: boolean;
  disabledAt: string | null;
  plantCount: number;
}

export async function listAccounts(): Promise<AccountSummary[]> {
  const rows = await db.user.findMany({
    select: { email: true, name: true, createdAt: true, isAdmin: true, disabledAt: true, _count: { select: { plants: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    email: r.email,
    name: r.name,
    createdAt: r.createdAt.toISOString(),
    isAdmin: r.isAdmin,
    disabledAt: r.disabledAt ? r.disabledAt.toISOString() : null,
    plantCount: r._count.plants,
  }));
}

export type ResendTemplate = "confirmation" | "welcome" | "waitlisted";

/**
 * Renvoie un email deja envoye (ex. supprime par erreur cote destinataire) --
 * seul le template correspondant au statut ACTUEL du signup est accepte,
 * pour ne jamais envoyer un mail de bienvenue a quelqu'un encore PENDING ou
 * l'inverse.
 */
export async function resendBetaEmail(id: string, template: ResendTemplate): Promise<void> {
  const signup = await db.betaSignup.findUnique({ where: { id } });
  if (!signup) {
    throw new NotFoundError("Inscription introuvable.");
  }

  if (template === "confirmation") {
    if (signup.status !== "PENDING") {
      throw new ConflictError("Cette inscription est déjà confirmée, pas de mail de confirmation à renvoyer.");
    }
    const confirmUrl = `${process.env.NEXTAUTH_URL}/api/beta/confirm?token=${signup.token}`;
    const { subject, html, text } = confirmationRequestEmail(confirmUrl);
    await sendEmail(signup.email, subject, html, text);
    return;
  }

  if (template === "welcome") {
    if (signup.status !== "CONFIRMED") {
      throw new ConflictError("Cette inscription n'est pas confirmée, pas de mail de bienvenue à renvoyer.");
    }
    const { subject, html, text } = confirmedWelcomeEmail();
    await sendEmail(signup.email, subject, html, text);
    return;
  }

  if (signup.status !== "WAITLISTED") {
    throw new ConflictError("Cette inscription n'est pas en liste d'attente.");
  }
  const { subject, html, text } = waitlistedEmail();
  await sendEmail(signup.email, subject, html, text);
}

/**
 * Envoie le lien d'invitation au programme de test ferme Google Play --
 * reserve aux inscriptions CONFIRMED (les seules avec une place garantie).
 * Pas de garde sur invitedAt deja renseigne : un renvoi volontaire depuis le
 * panel doit rester possible (voir discussion du 2026-09-16).
 */
export async function sendBetaInvite(id: string, playConsoleUrl: string): Promise<void> {
  const signup = await db.betaSignup.findUnique({ where: { id } });
  if (!signup) {
    throw new NotFoundError("Inscription introuvable.");
  }
  if (signup.status !== "CONFIRMED") {
    throw new ConflictError("Seule une inscription confirmée peut recevoir une invitation.");
  }

  const { subject, html, text } = invitationEmail(playConsoleUrl);
  await sendEmail(signup.email, subject, html, text);
  await db.betaSignup.update({ where: { id }, data: { invitedAt: new Date() } });
}
