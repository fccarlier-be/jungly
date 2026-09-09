import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedCareRule } from "@/server/ownership";
import { updateCareRuleSchema } from "@/server/validation/careRule";
import { ensurePendingTaskForRule } from "@/server/careEngine/service";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedCareRule(userId, id);

    const body = await request.json();
    const input = updateCareRuleSchema.parse(body);

    const rule = await db.plantCareRule.update({
      where: { id },
      data: { ...input, configuration: input.configuration as Prisma.InputJsonValue | undefined },
    });

    if (rule.enabled) {
      // La règle a changé (fréquence, date, activation) : si une tâche
      // PENDING existe déjà elle est conservée telle quelle (on ne modifie
      // pas une échéance déjà communiquée à l'utilisateur), sinon on en
      // génère une nouvelle à partir de maintenant.
      await ensurePendingTaskForRule(rule);
    }

    return NextResponse.json(rule);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedCareRule(userId, id);

    await db.plantCareRule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
