import { db } from "@/server/db";
import { fetchRecentMaxTemperatures } from "./client";
import { computeWateringMultiplier } from "./multiplier";
import { computeRuleNextDueDate, type RuleConfiguration } from "@/server/careEngine/taskGenerator";

/**
 * Rafraichit le multiplicateur meteo d'un utilisateur et avance les taches
 * d'arrosage PENDING deja planifiees si la meteo du jour suggere une
 * echeance plus proche. Ne repousse jamais une echeance existante -- une
 * amelioration meteo n'annule pas un arrosage deja prevu bientot, elle
 * accelere seulement en cas de chaleur.
 */
export async function refreshWeatherProfile(profile: {
  id: string;
  userId: string;
  latitude: number;
  longitude: number;
}): Promise<void> {
  const temps = await fetchRecentMaxTemperatures(profile.latitude, profile.longitude);
  const multiplier = computeWateringMultiplier(temps);

  await db.weatherProfile.update({ where: { id: profile.id }, data: { wateringIntervalMultiplier: multiplier } });

  const tasks = await db.task.findMany({
    where: { status: "PENDING", type: "WATERING", plant: { userId: profile.userId } },
    include: { careRule: true },
  });

  for (const task of tasks) {
    if (!task.careRule) continue;

    const lastEvent = await db.careEvent.findFirst({
      where: { plantId: task.plantId, type: "WATERING" },
      orderBy: { performedAt: "desc" },
    });
    const fromDate = lastEvent?.performedAt ?? task.careRule.createdAt;

    const candidate = computeRuleNextDueDate(
      {
        enabled: task.careRule.enabled,
        type: task.careRule.type,
        recurrenceType: task.careRule.recurrenceType,
        interval: task.careRule.interval,
        configuration: (task.careRule.configuration as RuleConfiguration | null) ?? undefined,
      },
      fromDate,
      multiplier,
    );

    if (candidate && candidate.getTime() < task.dueAt.getTime()) {
      await db.task.update({ where: { id: task.id }, data: { dueAt: candidate } });
    }
  }
}

