import { db } from "@/server/db";
import { sendEmail } from "@/lib/email";
import { emailShell, type EmailContent } from "@/server/emailTemplates";
import { resolvePhotoUrl } from "@/server/uploads";
import type { CreateFeedbackInput } from "@/server/validation/feedback";

// Page publique (site vitrine, jungly-site) listant les tickets par statut
// -- voir jungly-admin/app/main.py (endpoint /api/tickets/public) et memoire
// jungly_feedback_ticket_roadmap_plan.md pour l'architecture complete.
const TICKETS_URL = "https://jungly.fcold.org/tickets.html";

export function feedbackConfirmationEmail(): EmailContent {
  return {
    subject: "Ton retour a bien été reçu",
    html: emailShell(
      "Merci pour ton retour !",
      `<p style="font-size:0.95rem;line-height:1.6;">Ton retour vient d'être transmis au développeur de Jungly et sera étudié prochainement.</p>
       <p style="margin:28px 0;"><a href="${TICKETS_URL}" style="background:#22361a;color:#f5f2e6;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Voir l'avancement des retours</a></p>
       <p style="font-size:0.82rem;color:#6f7566;">Cette page regroupe les tickets ouverts, en cours et résolus.</p>`,
    ),
    text: `Ton retour vient d'être transmis au développeur de Jungly et sera étudié prochainement.

Voir l'avancement des retours : ${TICKETS_URL}`,
  };
}

/**
 * Envoie systematiquement la confirmation a la VRAIE adresse de la session,
 * meme pour un retour anonyme (input.anonymous ne s'applique qu'au champ
 * userId enregistre sur le retour, jamais a la confirmation elle-meme --
 * l'utilisateur sait deja qu'il vient d'envoyer ce retour).
 */
export async function createFeedback(sessionUserId: string, input: CreateFeedbackInput) {
  const [photoUrl, user] = await Promise.all([
    resolvePhotoUrl(sessionUserId, input.photoUrl),
    db.user.findUniqueOrThrow({ where: { id: sessionUserId }, select: { email: true } }),
  ]);

  const feedback = await db.feedback.create({
    data: {
      userId: input.anonymous ? null : sessionUserId,
      topic: input.topic,
      content: input.content,
      photoUrl,
    },
  });

  const { subject, html, text } = feedbackConfirmationEmail();
  await sendEmail(user.email, subject, html, text);

  return feedback;
}
