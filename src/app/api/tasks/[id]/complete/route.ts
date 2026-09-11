import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedTask } from "@/server/ownership";
import { waterEventSchema } from "@/server/validation/careEvent";
import { completeTaskWithEvent } from "@/server/careEngine/service";
import type { CareEventType } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

/**
 * Complète une tâche générique (utile pour PRUNING/INSPECTION/OTHER, ou
 * pour compléter une tâche WATERING/FERTILIZING/REPOTTING directement par
 * son id plutôt que via /api/plants/:id/water|fertilize|repot).
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const task = await getOwnedTask(userId, id);

    const body = await request.json().catch(() => ({}));
    const input = waterEventSchema.omit({ careRuleId: true }).parse(body);

    const event = await completeTaskWithEvent(task.id, task.type as CareEventType, {
      performedAt: input.performedAt,
      quantity: input.quantity,
      unit: input.unit,
      method: input.method,
      note: input.note,
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
