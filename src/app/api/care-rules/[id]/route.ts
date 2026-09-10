import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedCareRule } from "@/server/ownership";
import { recurrenceComboCheckSchema, updateCareRuleSchema } from "@/server/validation/careRule";
import { ensurePendingTaskForRule } from "@/server/careEngine/service";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const existing = await getOwnedCareRule(userId, id);

    const body = await request.json();
    const input = updateCareRuleSchema.parse(body);

    // updateCareRuleSchema ne peut pas, a lui seul, verifier la coherence
    // recurrenceType/interval/exactDate puisque chaque champ est optionnel
    // independamment : on revalide donc l'etat FUSIONNE avec la regle
    // existante (ex. passer a FIXED_INTERVAL_DAYS sans toucher interval,
    // alors que la regle etait MANUAL jusque-la).
    recurrenceComboCheckSchema.parse({
      type: existing.type,
      recurrenceType: input.recurrenceType ?? existing.recurrenceType,
      interval: input.interval ?? existing.interval,
      configuration: (input.configuration ?? existing.configuration) as Record<string, unknown> | null,
    });

    // Desactiver une regle ne faisait jusqu'ici qu'empecher la GENERATION de
    // futures taches -- une tache PENDING/SNOOZED deja creee continuait
    // d'apparaitre indefiniment. Le bloc ci-dessous, atomique, annule toute
    // tache existante et efface nextDueAt des qu'une regle se retrouve
    // desactivee (pas seulement au moment precis de la transition, pour
    // aussi rattraper une regle deja desactivee avant ce correctif).
    const rule = await db.$transaction(async (tx) => {
      const updated = await tx.plantCareRule.update({
        where: { id },
        data: { ...input, configuration: input.configuration as Prisma.InputJsonValue | undefined },
      });

      if (!updated.enabled) {
        await tx.task.updateMany({
          where: { careRuleId: id, status: { in: ["PENDING", "SNOOZED"] } },
          data: { status: "SKIPPED" },
        });
        if (updated.nextDueAt !== null) {
          return tx.plantCareRule.update({ where: { id }, data: { nextDueAt: null } });
        }
      }

      return updated;
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
