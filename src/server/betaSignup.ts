import crypto from "crypto";
import { db } from "@/server/db";

export const BETA_SIGNUP_LIMIT = 12;

export function generateBetaToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export type ConfirmBetaSignupResult =
  | { outcome: "invalid" }
  | { outcome: "already-confirmed" }
  | { outcome: "already-waitlisted" }
  | { outcome: "confirmed"; email: string }
  | { outcome: "waitlisted"; email: string };

/**
 * La place est attribuee a la confirmation (premier arrive, premier servi),
 * pas a l'ordre d'inscription -- le compte des CONFIRMED et la mise a jour
 * du statut partagent une transaction pour eviter que deux confirmations
 * simultanees ne s'attribuent chacune la derniere place.
 */
export async function confirmBetaSignupByToken(token: string): Promise<ConfirmBetaSignupResult> {
  const signup = await db.betaSignup.findUnique({ where: { token } });
  if (!signup) {
    return { outcome: "invalid" };
  }
  if (signup.status === "CONFIRMED") {
    return { outcome: "already-confirmed" };
  }
  if (signup.status === "WAITLISTED") {
    return { outcome: "already-waitlisted" };
  }

  const finalStatus = await db.$transaction(async (tx) => {
    const confirmedCount = await tx.betaSignup.count({ where: { status: "CONFIRMED" } });
    const status = confirmedCount < BETA_SIGNUP_LIMIT ? "CONFIRMED" : "WAITLISTED";
    await tx.betaSignup.update({
      where: { id: signup.id },
      data: { status, confirmedAt: new Date() },
    });
    return status;
  });

  return finalStatus === "CONFIRMED"
    ? { outcome: "confirmed", email: signup.email }
    : { outcome: "waitlisted", email: signup.email };
}

function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:32px 16px;background:#f6f2e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#23281f;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;">
    <p style="font-size:0.78rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#7c9473;margin:0 0 12px;">Jungly</p>
    <h1 style="font-size:1.3rem;margin:0 0 16px;color:#22361a;">${title}</h1>
    ${bodyHtml}
  </div>
</body>
</html>`;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export function confirmationRequestEmail(confirmUrl: string): EmailContent {
  return {
    subject: "Confirmez votre inscription à la bêta Jungly",
    html: emailShell(
      "Une dernière étape",
      `<p style="font-size:0.95rem;line-height:1.6;">Merci de votre intérêt pour la bêta Android de Jungly ! Confirmez votre adresse pour rejoindre la liste — il ne reste que ${BETA_SIGNUP_LIMIT} places.</p>
       <p style="margin:28px 0;"><a href="${confirmUrl}" style="background:#22361a;color:#f5f2e6;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Confirmer mon inscription</a></p>
       <p style="font-size:0.82rem;color:#6f7566;">Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement ce message, il ne se passera rien.</p>`,
    ),
    text: `Merci de votre intérêt pour la bêta Android de Jungly !

Confirmez votre adresse pour rejoindre la liste (il ne reste que ${BETA_SIGNUP_LIMIT} places) en ouvrant ce lien :
${confirmUrl}

Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement ce message, il ne se passera rien.`,
  };
}

export function confirmedWelcomeEmail(): EmailContent {
  return {
    subject: "Vous êtes inscrit·e à la bêta Jungly !",
    html: emailShell(
      "Votre place est réservée",
      `<p style="font-size:0.95rem;line-height:1.6;">Votre inscription à la bêta Android de Jungly est confirmée. Vous recevrez un email avec le lien d'invitation dès que la bêta ouvrira — aucune autre action n'est nécessaire pour l'instant.</p>`,
    ),
    text: `Votre inscription à la bêta Android de Jungly est confirmée.

Vous recevrez un email avec le lien d'invitation dès que la bêta ouvrira — aucune autre action n'est nécessaire pour l'instant.`,
  };
}

export function waitlistedEmail(): EmailContent {
  return {
    subject: "Vous êtes sur liste d'attente pour la bêta Jungly",
    html: emailShell(
      "Liste d'attente",
      `<p style="font-size:0.95rem;line-height:1.6;">Les ${BETA_SIGNUP_LIMIT} places de la bêta ont trouvé preneur entre votre inscription et votre confirmation — vous êtes désormais sur liste d'attente. Si une place se libère, vous serez contacté·e par email en priorité.</p>`,
    ),
    text: `Les ${BETA_SIGNUP_LIMIT} places de la bêta ont trouvé preneur entre votre inscription et votre confirmation — vous êtes désormais sur liste d'attente.

Si une place se libère, vous serez contacté·e par email en priorité.`,
  };
}
