import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedPlant } from "@/server/ownership";
import { repotEventSchema } from "@/server/validation/careEvent";
import { recordStandaloneCareEvent } from "@/server/careEngine/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedPlant(userId, id);

    const body = await request.json().catch(() => ({}));
    const input = repotEventSchema.parse(body);

    const event = await recordStandaloneCareEvent(
      id,
      "REPOTTING",
      {
        performedAt: input.performedAt,
        note: input.note,
        metadata: {
          oldPotDiameterMm: input.oldPotDiameterMm,
          newPotDiameterMm: input.newPotDiameterMm,
          newPotHeightMm: input.newPotHeightMm,
          substrate: input.substrate,
        },
      },
      input.careRuleId,
    );

    await db.plant.update({
      where: { id },
      data: {
        potDiameterMm: input.newPotDiameterMm ?? undefined,
        potHeightMm: input.newPotHeightMm ?? undefined,
        substrate: input.substrate ?? undefined,
      },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
