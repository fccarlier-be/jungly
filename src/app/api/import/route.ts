import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { backupSchema } from "@/server/validation/backup";
import { ensurePendingTaskForRule } from "@/server/careEngine/service";

/**
 * Restaure une sauvegarde. Les emplacements/engrais sont rapprochés par nom
 * (créés s'ils n'existent pas) ; les plantes sont toujours créées en
 * nouveaux enregistrements (jamais de fusion/écrasement silencieux d'une
 * plante existante). Les tâches ne sont pas importées telles quelles :
 * chaque règle active régénère sa propre tâche PENDING via le CareEngine,
 * pour ne jamais restaurer un état de tâche périmé.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const data = backupSchema.parse(body);

    const locationIdByName = new Map<string, string>();
    for (const loc of data.locations) {
      const existing = await db.location.findUnique({ where: { userId_name: { userId, name: loc.name } } });
      const record = existing ?? (await db.location.create({ data: { userId, name: loc.name } }));
      locationIdByName.set(loc.name, record.id);
    }

    const fertilizerIdByName = new Map<string, string>();
    for (const fert of data.fertilizers) {
      const existing = await db.fertilizer.findFirst({ where: { userId, name: fert.name } });
      const record =
        existing ??
        (await db.fertilizer.create({
          data: {
            userId,
            name: fert.name,
            manufacturer: fert.manufacturer ?? undefined,
            type: fert.type ?? undefined,
            nitrogen: fert.nitrogen ?? undefined,
            phosphorus: fert.phosphorus ?? undefined,
            potassium: fert.potassium ?? undefined,
            defaultDosage: fert.defaultDosage ?? undefined,
            dosageUnit: fert.dosageUnit ?? undefined,
            notes: fert.notes ?? undefined,
          },
        }));
      fertilizerIdByName.set(fert.name, record.id);
    }

    let importedPlants = 0;
    for (const p of data.plants) {
      const locationId = p.locationName ? locationIdByName.get(p.locationName) : undefined;

      const plant = await db.plant.create({
        data: {
          userId,
          name: p.name,
          scientificName: p.scientificName ?? undefined,
          photoUrl: p.photoUrl ?? undefined,
          locationId,
          acquiredAt: p.acquiredAt ?? undefined,
          potDiameterMm: p.potDiameterMm ?? undefined,
          potHeightMm: p.potHeightMm ?? undefined,
          potMaterial: p.potMaterial ?? undefined,
          substrate: p.substrate ?? undefined,
          exposure: p.exposure ?? undefined,
          temperatureNote: p.temperatureNote ?? undefined,
          humidityNote: p.humidityNote ?? undefined,
          notes: p.notes ?? undefined,
        },
      });

      for (const rule of p.careRules) {
        const configuration: Record<string, unknown> = { ...(rule.configuration ?? {}) };
        if (rule.fertilizerName) {
          const fertilizerId = fertilizerIdByName.get(rule.fertilizerName);
          if (fertilizerId) configuration.fertilizerId = fertilizerId;
        }

        const createdRule = await db.plantCareRule.create({
          data: {
            plantId: plant.id,
            type: rule.type,
            enabled: rule.enabled,
            recurrenceType: rule.recurrenceType,
            interval: rule.interval ?? undefined,
            configuration: configuration as Prisma.InputJsonValue,
          },
        });

        if (createdRule.enabled) {
          await ensurePendingTaskForRule(createdRule);
        }
      }

      for (const event of p.careEvents) {
        await db.careEvent.create({
          data: {
            plantId: plant.id,
            type: event.type,
            performedAt: event.performedAt,
            quantity: event.quantity ?? undefined,
            unit: event.unit ?? undefined,
            metadata: (event.metadata as Prisma.InputJsonValue | null) ?? undefined,
            note: event.note ?? undefined,
          },
        });
      }

      for (const note of p.plantNotes) {
        await db.note.create({
          data: { plantId: plant.id, content: note.content, category: note.category, photoUrl: note.photoUrl ?? undefined },
        });
      }

      importedPlants += 1;
    }

    if (data.notificationPreference) {
      await db.notificationPreference.upsert({
        where: { userId },
        update: data.notificationPreference,
        create: { userId, ...data.notificationPreference },
      });
    }

    return NextResponse.json({ ok: true, importedPlants });
  } catch (error) {
    return handleApiError(error);
  }
}
