import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@generated/prisma/client";
import { db } from "@/server/db";
import { handleApiError } from "@/lib/apiError";
import { betaSignupSchema } from "@/server/validation/betaSignup";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { withPublicCors, publicCorsPreflight } from "@/lib/cors";
import { sendEmail } from "@/lib/email";
import { generateBetaToken, confirmationRequestEmail } from "@/server/betaSignup";

export function OPTIONS() {
  return publicCorsPreflight();
}

/**
 * Toujours une reponse generique en cas de succes, y compris si l'email est
 * deja inscrit (PENDING/CONFIRMED/WAITLISTED) : evite de laisser un
 * formulaire public reveler quelles adresses sont deja sur la liste.
 */
const GENERIC_SUCCESS = { message: "Vérifiez votre boîte mail pour confirmer votre inscription." };

export async function POST(request: NextRequest) {
  try {
    const { allowed, retryAfterSeconds } = checkRateLimit(`beta-signup:${getClientIp(request)}`, 5, 15 * 60 * 1000);
    if (!allowed) {
      return withPublicCors(rateLimitResponse(retryAfterSeconds));
    }

    const body = await request.json();
    const { email } = betaSignupSchema.parse(body);

    const existing = await db.betaSignup.findUnique({ where: { email } });

    if (!existing) {
      const token = generateBetaToken();
      await db.betaSignup.create({ data: { email, token } });
      const confirmUrl = `${process.env.NEXTAUTH_URL}/api/beta/confirm?token=${token}`;
      const { subject, html, text } = confirmationRequestEmail(confirmUrl);
      await sendEmail(email, subject, html, text);
    } else if (existing.status === "PENDING") {
      // Renvoie le meme lien plutot que d'en regenerer un : evite d'invalider
      // silencieusement un email de confirmation deja recu et pas encore ouvert.
      const confirmUrl = `${process.env.NEXTAUTH_URL}/api/beta/confirm?token=${existing.token}`;
      const { subject, html, text } = confirmationRequestEmail(confirmUrl);
      await sendEmail(email, subject, html, text);
    }
    // CONFIRMED / WAITLISTED : rien a renvoyer, l'utilisateur a deja recu son email.

    return withPublicCors(NextResponse.json(GENERIC_SUCCESS, { status: 200 }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Course avec une autre requete simultanee sur le meme email, deja geree
      // cote metier -- on repond quand meme le message generique de succes.
      return withPublicCors(NextResponse.json(GENERIC_SUCCESS, { status: 200 }));
    }
    return withPublicCors(handleApiError(error));
  }
}
