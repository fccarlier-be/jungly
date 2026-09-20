import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { createFeedbackSchema } from "@/server/validation/feedback";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { createFeedback } from "@/server/feedback";

export async function POST(request: NextRequest) {
  try {
    // Toujours la vraie session, meme pour un retour anonyme : necessaire
    // pour la limite de debit, l'email de confirmation, et pour verifier la
    // propriete d'une capture d'ecran jointe -- l'anonymat ne s'applique
    // qu'au champ userId ENREGISTRE sur le retour, jamais a
    // l'authentification elle-meme (deja exigee pour acceder a /feedback).
    const sessionUserId = await requireUserId();

    // Anti-spam simple : un beta-testeur n'a besoin d'envoyer que quelques
    // retours, jamais des dizaines dans l'heure.
    const { allowed, retryAfterSeconds } = checkRateLimit(`feedback-create:${sessionUserId}`, 10, 60 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const body = await request.json();
    const input = createFeedbackSchema.parse(body);
    const feedback = await createFeedback(sessionUserId, input);
    return NextResponse.json(feedback, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
