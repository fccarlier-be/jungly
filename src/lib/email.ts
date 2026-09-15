import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Sans RESEND_API_KEY (dev local, CI), on journalise au lieu d'echouer :
 * l'inscription beta reste utilisable pour tester le reste du parcours
 * sans compte Resend.
 */
/**
 * `text` (alternative texte brut) n'est pas que cosmetique : son absence est
 * un signal courant de spam pour les filtres des messageries (Gmail
 * notamment) -- un email HTML sans partie texte a plus de chances de finir
 * en spam, constate en verification reelle le 2026-09-15.
 */
export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY absente, email non envoyé (to=${to}, subject="${subject}")`);
    return;
  }

  const from = process.env.BETA_SIGNUP_FROM_EMAIL || "Jungly <onboarding@resend.dev>";
  const { error } = await resend.emails.send({ from, to, subject, html, text });
  if (error) {
    console.error(`[email] Échec d'envoi vers ${to} :`, error);
  }
}
