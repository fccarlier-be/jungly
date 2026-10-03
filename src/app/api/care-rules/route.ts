import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedPlant, getOwnedFertilizer } from "@/server/ownership";
import { createCareRuleSchema } from "@/server/validation/careRule";
import { ensurePendingTaskForRule } from "@/server/careEngine/service";
import { firstDueDateBasis } from "@/server/careEngine/recurrence";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const input = createCareRuleSchema.parse(body);

    const plant = await getOwnedPlant(userId, input.plantId);
    // configuration.fertilizerId est un id fourni par le client (regle
    // FERTILIZING) : sans cette verification, un utilisateur pouvait faire
    // pointer sa regle vers l'engrais d'un AUTRE compte, dont le nom et la
    // composition NPK sont ensuite affiches sur son propre tableau de bord
    // (page.tsx resout ces ids sans filtrer par userId).
    if (input.type === "FERTILIZING" && input.configuration?.fertilizerId) {
      await getOwnedFertilizer(userId, input.configuration.fertilizerId);
    }

    // Creation de la regle + generation de sa premiere tache dans une seule
    // transaction : sans ca, un echec dans ensurePendingTaskForRule (ex.
    // combinaison recurrenceType/interval/exactDate invalide passee malgre
    // la validation Zod) laissait une regle orpheline en base, creee mais
    // sans aucune tache generee.
    const rule = await db.$transaction(async (tx) => {
      const created = await tx.plantCareRule.create({
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

      if (created.enabled) {
        // Pour une recurrence longue (mensuelle/annuelle), part de la date
        // d'acquisition de la plante plutot que d'aujourd'hui quand elle est
        // connue (ticket #6, 2026-10-01) : "rempoter tous les 24 mois" sur
        // une plante acquise il y a un an tombe alors dans 12 mois, pas 24.
        const fromDate = firstDueDateBasis(created.recurrenceType, plant.acquiredAt);
        await ensurePendingTaskForRule(created, fromDate, tx);
      }

      return created;
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
