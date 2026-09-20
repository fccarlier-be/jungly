import { db } from "@/server/db";
import { sendEmail } from "@/lib/email";
import { NotFoundError, ConflictError } from "@/lib/errors";
import {
  generateBetaToken,
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

export interface FeedbackDetail {
  id: string;
  topic: string;
  content: string;
  photoUrl: string | null;
  createdAt: string;
  email: string | null;
}

/**
 * email null pour un retour envoye anonymement (userId null sur Feedback --
 * voir schema.prisma) OU dont l'auteur a depuis supprime son compte
 * (onDelete SetNull) : les deux cas sont indiscernables ici, deliberement --
 * jungly-admin n'a jamais a savoir lequel.
 */
export async function listFeedbackDetailed(): Promise<FeedbackDetail[]> {
  const rows = await db.feedback.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    topic: r.topic,
    content: r.content,
    photoUrl: r.photoUrl,
    createdAt: r.createdAt.toISOString(),
    email: r.user?.email ?? null,
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

/**
 * Ajoute manuellement une adresse a la liste d'attente beta depuis le panel
 * (invitation directe, sans passer par le formulaire public du site
 * vitrine) -- meme flux que POST /api/beta/signup (PENDING + mail de
 * confirmation), pas de confirmation automatique : la personne doit tout de
 * meme cliquer le lien, pour la meme raison que le formulaire public
 * (consentement reel, coherence avec la limite de places/liste d'attente).
 */
export async function createBetaSignupAndInvite(email: string): Promise<BetaSignupDetail> {
  const existing = await db.betaSignup.findUnique({ where: { email } });
  if (existing) {
    throw new ConflictError(`Cette adresse est déjà inscrite (statut : ${existing.status}).`);
  }

  const token = generateBetaToken();
  const signup = await db.betaSignup.create({ data: { email, token } });

  const confirmUrl = `${process.env.NEXTAUTH_URL}/api/beta/confirm?token=${token}`;
  const { subject, html, text } = confirmationRequestEmail(confirmUrl);
  await sendEmail(email, subject, html, text);

  return {
    id: signup.id,
    email: signup.email,
    status: signup.status,
    createdAt: signup.createdAt.toISOString(),
    confirmedAt: null,
    invitedAt: null,
  };
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
