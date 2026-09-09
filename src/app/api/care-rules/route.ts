import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedPlant } from "@/server/ownership";
import { createCareRuleSchema } from "@/server/validation/careRule";
import { ensurePendingTaskForRule } from "@/server/careEngine/service";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const input = createCareRuleSchema.parse(body);

    await getOwnedPlant(userId, input.plantId);

    const rule = await db.plantCareRule.create({
      data: {
        plantId: input.plantId,
        type: input.type,
        enabled: input.enabled,
        recurrenceType: input.recurrenceType,
        interval: input.interval,
        configuration: input.configuration
          ? JSON.parse(
              JSON.stringify(input.configuration, (_key, value) =>
                value instanceof Date ? value.toISOString() : value,
              ),
            )
          : undefined,
      },
    });

    if (rule.enabled) {
      await ensurePendingTaskForRule(rule);
    }

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
