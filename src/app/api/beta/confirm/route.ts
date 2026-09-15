import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { confirmBetaSignupByToken, confirmedWelcomeEmail, waitlistedEmail } from "@/server/betaSignup";

/**
 * Construit la redirection depuis NEXTAUTH_URL, jamais depuis request.url :
 * derriere nginx (Docker), request.url reflete l'URL interne vue par le
 * conteneur (ex. http://<container-id>:3000), pas le domaine public --
 * constate en staging, ou le lien de l'email aurait redirige vers une
 * adresse injoignable pour l'utilisateur.
 */
function redirectToStatus(status: string): NextResponse {
  const url = new URL("/beta/confirmation", process.env.NEXTAUTH_URL);
  url.searchParams.set("status", status);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return redirectToStatus("invalid");
  }

  const result = await confirmBetaSignupByToken(token);

  if (result.outcome === "confirmed") {
    const { subject, html } = confirmedWelcomeEmail();
    await sendEmail(result.email, subject, html);
  } else if (result.outcome === "waitlisted") {
    const { subject, html } = waitlistedEmail();
    await sendEmail(result.email, subject, html);
  }

  return redirectToStatus(result.outcome);
}
