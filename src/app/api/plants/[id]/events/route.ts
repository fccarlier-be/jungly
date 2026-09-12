import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedPlant } from "@/server/ownership";
import { genericEventSchema } from "@/server/validation/careEvent";
import { recordStandaloneCareEvent } from "@/server/careEngine/service";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

/** Enregistre une taille, une inspection, ou tout autre événement sans règle associée. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();

    // Quota de ressources par compte (audit security1.md, P2), partage
    // entre toutes les routes de creation d'evenement de soin.
    const { allowed, retryAfterSeconds } = checkRateLimit(`care-event:${userId}`, 200, 60 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const { id } = await params;
    await getOwnedPlant(userId, id);

    const body = await request.json().catch(() => ({}));
    const input = genericEventSchema.parse(body);

    const event = await recordStandaloneCareEvent(id, input.type, {
      performedAt: input.performedAt,
      note: input.note,
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
