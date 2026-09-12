import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedPlant } from "@/server/ownership";
import { waterEventSchema } from "@/server/validation/careEvent";
import { recordStandaloneCareEvent } from "@/server/careEngine/service";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();

    // Quota de ressources par compte (audit security1.md, P2) : aucune
    // route de creation d'evenement n'etait bornee, un compte pouvait
    // gonfler indefiniment CareEvent/Task.
    const { allowed, retryAfterSeconds } = checkRateLimit(`care-event:${userId}`, 200, 60 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const { id } = await params;
    await getOwnedPlant(userId, id);

    const body = await request.json().catch(() => ({}));
    const input = waterEventSchema.parse(body);

    const quantityMl = input.unit === "L" && input.quantity != null ? input.quantity * 1000 : input.quantity;

    const event = await recordStandaloneCareEvent(
      id,
      "WATERING",
      {
        performedAt: input.performedAt,
        quantity: quantityMl,
        unit: quantityMl != null ? "ml" : undefined,
        method: input.method,
        note: input.note,
      },
      input.careRuleId,
    );

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
