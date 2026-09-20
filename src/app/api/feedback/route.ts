import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { createFeedbackSchema } from "@/server/validation/feedback";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { resolvePhotoUrl } from "@/server/uploads";

export async function POST(request: NextRequest) {
  try {
    // Toujours la vraie session, meme pour un retour anonyme : necessaire
    // pour la limite de debit et pour verifier la propriete d'une capture
    // d'ecran jointe (resolvePhotoUrl) -- l'anonymat ne s'applique qu'au
    // champ userId ENREGISTRE sur le retour, jamais a l'authentification
    // elle-meme (deja exigee pour simplement acceder a /feedback).
    const sessionUserId = await requireUserId();

    // Anti-spam simple : un beta-testeur n'a besoin d'envoyer que quelques
    // retours, jamais des dizaines dans l'heure.
    const { allowed, retryAfterSeconds } = checkRateLimit(`feedback-create:${sessionUserId}`, 10, 60 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const body = await request.json();
    const input = createFeedbackSchema.parse(body);
    const photoUrl = await resolvePhotoUrl(sessionUserId, input.photoUrl);

    const feedback = await db.feedback.create({
      data: {
        userId: input.anonymous ? null : sessionUserId,
        topic: input.topic,
        content: input.content,
        photoUrl,
      },
    });
    return NextResponse.json(feedback, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
