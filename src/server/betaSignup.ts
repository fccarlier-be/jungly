import crypto from "crypto";
import { db } from "@/server/db";
import { emailShell, type EmailContent } from "@/server/emailTemplates";

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

/**
 * `playConsoleUrl` est fourni a l'envoi (pas une constante) : le lien
 * d'inscription au test ferme Google Play n'existe qu'une fois le compte
 * developpeur valide et l'app soumise -- inconnu au moment d'ecrire ce
 * template.
 *
 * Les testeurs sont deja inscrits au programme (ajoutes cote Play Console
 * en amont) -- le lien mene directement a la fiche Play Store, pas a une
 * etape d'adhesion. `email` sert uniquement a leur rappeler quel compte
 * Google utiliser, seule condition pour que l'app apparaisse installable.
 */
export function invitationEmail(playConsoleUrl: string, email: string): EmailContent {
  return {
    subject: "La bêta Android de Jungly est ouverte !",
    html: emailShell(
      "C'est ouvert !",
      `<p style="font-size:0.95rem;line-height:1.6;">Bonne nouvelle : la bêta Android de Jungly est maintenant ouverte, et vous en faites partie — vous êtes déjà inscrit·e comme testeur, aucune démarche d'adhésion supplémentaire n'est nécessaire.</p>
       <p style="font-size:0.95rem;line-height:1.6;"><strong>Important :</strong> ouvrez le lien ci-dessous depuis votre appareil Android, connecté au Play Store avec l'adresse <strong>${email}</strong> (celle fournie à l'inscription). C'est la seule condition pour que l'app apparaisse comme installable.</p>
       <p style="margin:28px 0;"><a href="${playConsoleUrl}" style="background:#22361a;color:#f5f2e6;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Installer Jungly</a></p>
       <p style="font-size:0.95rem;line-height:1.6;">Pour tester l'app, choisissez l'option payante (offre hébergée) lors de la configuration — en tant que testeur, aucun montant ne sera réellement prélevé, et vous conserverez un accès gratuit à vie à cette offre.</p>
       <p style="font-size:0.95rem;line-height:1.6;">Une option de feedback est disponible directement dans les paramètres de l'app : n'hésitez pas à l'utiliser pour tout bug, retour ou suggestion.</p>`,
    ),
    text: `Bonne nouvelle : la bêta Android de Jungly est maintenant ouverte, et vous en faites partie — vous êtes déjà inscrit·e comme testeur, aucune démarche d'adhésion supplémentaire n'est nécessaire.

Important : ouvrez ce lien depuis votre appareil Android, connecté au Play Store avec l'adresse ${email} (celle fournie à l'inscription). C'est la seule condition pour que l'app apparaisse comme installable.

Installer Jungly : ${playConsoleUrl}

Pour tester l'app, choisissez l'option payante (offre hébergée) lors de la configuration — en tant que testeur, aucun montant ne sera réellement prélevé, et vous conserverez un accès gratuit à vie à cette offre.

Une option de feedback est disponible directement dans les paramètres de l'app : n'hésitez pas à l'utiliser pour tout bug, retour ou suggestion.`,
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
