import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { createFeedbackSchema } from "@/server/validation/feedback";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();

    // Anti-spam simple : un beta-testeur n'a besoin d'envoyer que quelques
    // retours, jamais des dizaines dans l'heure.
    const { allowed, retryAfterSeconds } = checkRateLimit(`feedback-create:${userId}`, 10, 60 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const body = await request.json();
    const input = createFeedbackSchema.parse(body);

    const feedback = await db.feedback.create({ data: { userId, content: input.content } });
    return NextResponse.json(feedback, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
