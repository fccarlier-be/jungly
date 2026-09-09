import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedPlant } from "@/server/ownership";
import { waterEventSchema } from "@/server/validation/careEvent";
import { recordStandaloneCareEvent } from "@/server/careEngine/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
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
