import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { sendEmail } from "@/lib/email";
import { ConflictError } from "@/lib/errors";
import { emailShell, type EmailContent } from "@/server/emailTemplates";

/** Assez court pour limiter la fenetre d'exposition d'un lien intercepte, assez long pour qu'un utilisateur normal ait le temps de l'utiliser. */
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function generatePasswordResetToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function passwordResetEmail(resetUrl: string): EmailContent {
  return {
    subject: "Réinitialisez votre mot de passe Jungly",
    html: emailShell(
      "Réinitialiser le mot de passe",
      `<p style="font-size:0.95rem;line-height:1.6;">Une demande de réinitialisation de mot de passe a été faite pour ce compte Jungly. Ce lien est valable une heure.</p>
       <p style="margin:28px 0;"><a href="${resetUrl}" style="background:#17503a;color:#f5f2e6;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Choisir un nouveau mot de passe</a></p>
       <p style="font-size:0.82rem;color:#6f7566;">Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement ce message, votre mot de passe actuel reste inchangé.</p>`,
    ),
    text: `Une demande de réinitialisation de mot de passe a été faite pour ce compte Jungly.

Choisissez un nouveau mot de passe ici (lien valable une heure) :
${resetUrl}

Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement ce message, votre mot de passe actuel reste inchangé.`,
  };
}

/**
 * Toujours silencieux si l'email n'existe pas -- meme motif que le
 * formulaire beta public (src/server/betaSignup.ts) : ne jamais laisser un
 * formulaire public reveler quelles adresses ont un compte.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    return;
  }

  const token = generatePasswordResetToken();
  await db.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS) },
  });

  const resetUrl = `${process.env.NEXTAUTH_URL}/reinitialiser-mot-de-passe?token=${token}`;
  const { subject, html, text } = passwordResetEmail(resetUrl);
  // Envoi NON attendu : l'appel a Resend (plusieurs centaines de ms) ne se
  // faisait que pour un compte existant, et la route repondait donc
  // mesurablement plus lentement dans ce cas -- de quoi deviner par le temps
  // de reponse quelles adresses ont un compte, malgre la reponse identique
  // (audit du 2026-09-25, meme principe que DUMMY_PASSWORD_HASH dans
  // auth.ts). Le serveur tourne en continu (pas de fonction serverless
  // interrompue apres la reponse) : l'envoi se termine en arriere-plan.
  void Promise.resolve()
    .then(() => sendEmail(email, subject, html, text))
    .catch((error) => {
      console.error("[password-reset] envoi de l'e-mail impossible :", error);
    });
}

/**
 * A l'inverse de requestPasswordReset, le token EST le secret ici (deja
 * connu seulement de qui a recu l'email) -- confirmer explicitement qu'il
 * est invalide/expire ne revele rien de plus a un attaquant qui le possede
 * deja.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const resetToken = await db.passwordResetToken.findUnique({ where: { token } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    throw new ConflictError("Ce lien de réinitialisation est invalide ou a expiré.");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.$transaction([
    db.user.update({ where: { id: resetToken.userId }, data: { passwordHash, sessionVersion: { increment: 1 } } }),
    db.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    // Un mot de passe reinitialise invalide toute AUTRE demande en attente
    // pour ce compte -- sans ca, un ancien lien de reinitialisation (envoye
    // avant celui-ci, jamais utilise) resterait valable jusqu'a sa propre
    // expiration.
    db.passwordResetToken.updateMany({
      where: { userId: resetToken.userId, usedAt: null, id: { not: resetToken.id } },
      data: { usedAt: new Date() },
    }),
  ]);
}
