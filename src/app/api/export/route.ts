import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import type { BackupData } from "@/server/validation/backup";

/**
 * Export complet des données de l'utilisateur. Les références (emplacement,
 * engrais) sont résolues par nom plutôt que par id interne, pour qu'un
 * import reste possible sur une autre installation. Les abonnements push
 * (spécifiques à un appareil) et les tâches (état dérivé, régénéré par le
 * CareEngine) ne sont volontairement pas exportés.
 */
export async function GET() {
  try {
    const userId = await requireUserId();

    const [locations, fertilizers, plants, preference] = await Promise.all([
      db.location.findMany({ where: { userId } }),
      db.fertilizer.findMany({ where: { userId } }),
      db.plant.findMany({
        where: { userId },
        include: {
          location: true,
          careRules: true,
          careEvents: { orderBy: { performedAt: "asc" } },
          plantNotes: { orderBy: { createdAt: "asc" } },
        },
      }),
      db.notificationPreference.findUnique({ where: { userId } }),
    ]);

    const fertilizerNameById = new Map(fertilizers.map((f) => [f.id, f.name]));

    const data: BackupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      locations: locations.map((l) => ({ name: l.name })),
      fertilizers: fertilizers.map((f) => ({
        name: f.name,
        manufacturer: f.manufacturer,
        type: f.type,
        nitrogen: f.nitrogen,
        phosphorus: f.phosphorus,
        potassium: f.potassium,
        defaultDosage: f.defaultDosage,
        dosageUnit: f.dosageUnit,
        notes: f.notes,
      })),
      plants: plants.map((p) => {
        const config = (rule: (typeof p.careRules)[number]) => rule.configuration as Record<string, unknown> | null;
        return {
          name: p.name,
          scientificName: p.scientificName,
          photoUrl: p.photoUrl,
          locationName: p.location?.name ?? null,
          acquiredAt: p.acquiredAt,
          potDiameterMm: p.potDiameterMm,
          potHeightMm: p.potHeightMm,
          potMaterial: p.potMaterial,
          substrate: p.substrate,
          exposure: p.exposure,
          temperatureNote: p.temperatureNote,
          humidityNote: p.humidityNote,
          notes: p.notes,
          careRules: p.careRules.map((rule) => {
            const cfg = config(rule);
            const fertilizerId = cfg?.fertilizerId as string | undefined;
            return {
              type: rule.type,
              enabled: rule.enabled,
              recurrenceType: rule.recurrenceType,
              interval: rule.interval,
              configuration: cfg,
              fertilizerName: fertilizerId ? (fertilizerNameById.get(fertilizerId) ?? null) : null,
            };
          }),
          careEvents: p.careEvents.map((e) => ({
            type: e.type,
            performedAt: e.performedAt,
            quantity: e.quantity,
            unit: e.unit,
            metadata: e.metadata,
            note: e.note,
          })),
          plantNotes: p.plantNotes.map((n) => ({ content: n.content, category: n.category, photoUrl: n.photoUrl })),
        };
      }),
      notificationPreference: preference
        ? {
            enabled: preference.enabled,
            notificationTime: preference.notificationTime,
            overdueEnabled: preference.overdueEnabled,
            advanceReminderDays: preference.advanceReminderDays,
          }
        : null,
    };

    return NextResponse.json(data, {
      headers: {
        "Content-Disposition": `attachment; filename="plant-manager-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
