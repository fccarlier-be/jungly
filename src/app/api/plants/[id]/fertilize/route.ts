import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedPlant } from "@/server/ownership";
import { fertilizeEventSchema } from "@/server/validation/careEvent";
import { recordStandaloneCareEvent } from "@/server/careEngine/service";
import { computeFertilizerAmount } from "@/server/careEngine/dosage";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

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
    const input = fertilizeEventSchema.parse(body);

    let quantity = input.quantity;
    if (quantity == null && input.dosagePerLiter != null && input.volumeLiters != null) {
      quantity = computeFertilizerAmount(input.dosagePerLiter, input.volumeLiters);
    }

    const event = await recordStandaloneCareEvent(
      id,
      "FERTILIZING",
      {
        performedAt: input.performedAt,
        quantity: quantity ?? undefined,
        unit: input.unit ?? "ml",
        method: input.method,
        note: input.note,
        metadata: {
          fertilizerId: input.fertilizerId,
          dosagePerLiter: input.dosagePerLiter,
          volumeLiters: input.volumeLiters,
        },
      },
      input.careRuleId,
    );

    return NextResponse.json({ event, computedQuantity: quantity }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
