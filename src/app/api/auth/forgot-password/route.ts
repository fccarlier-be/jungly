import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiError";
import { forgotPasswordSchema } from "@/server/validation/passwordReset";
import { requestPasswordReset } from "@/server/passwordReset";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";

const GENERIC_SUCCESS = { message: "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé." };

export async function POST(request: NextRequest) {
  try {
    // Meme ordre de grandeur que l'inscription -- sans limite, un script
    // pourrait declencher l'envoi de mails vers des dizaines d'adresses par
    // seconde.
    const { allowed, retryAfterSeconds } = checkRateLimit(`forgot-password:${getClientIp(request)}`, 5, 15 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const body = await request.json();
    const { email } = forgotPasswordSchema.parse(body);

    await requestPasswordReset(email);

    // Toujours la meme reponse, que le compte existe ou non (voir
    // requestPasswordReset).
    return NextResponse.json(GENERIC_SUCCESS);
  } catch (error) {
    return handleApiError(error);
  }
}
