import { Prisma, type CareEventType, type PlantCareRule, type Sensor, type SensorReading } from "@prisma/client";
import { db } from "@/server/db";
import { buildTaskTitle, computeRuleNextDueDate, mapRuleTypeToTaskType, type RuleConfiguration } from "./taskGenerator";
import { shouldTriggerFromMoistureReading } from "./sensorTrigger";

function toJsonInput(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  return value as Prisma.InputJsonValue | undefined;
}

/**
 * Crée la prochaine tâche PENDING d'une règle si elle n'existe pas déjà.
 * Idempotent : n'insère jamais un doublon si une tâche PENDING est déjà
 * associée à cette règle.
 */
export async function ensurePendingTaskForRule(rule: PlantCareRule, fromDate: Date = new Date()) {
  const existing = await db.task.findFirst({
    where: { careRuleId: rule.id, status: "PENDING" },
  });
  if (existing) {
    return existing;
  }

  const dueAt = computeRuleNextDueDate(
    {
      enabled: rule.enabled,
      type: rule.type,
      recurrenceType: rule.recurrenceType,
      interval: rule.interval,
      configuration: (rule.configuration as RuleConfiguration | null) ?? undefined,
    },
    fromDate,
  );
  if (dueAt == null) {
    return null;
  }

  const plant = await db.plant.findUniqueOrThrow({ where: { id: rule.plantId }, select: { name: true } });

  const [task] = await db.$transaction([
    db.task.create({
      data: {
        plantId: rule.plantId,
        careRuleId: rule.id,
        type: mapRuleTypeToTaskType(rule.type),
        title: buildTaskTitle(rule.type, plant.name),
        dueAt,
        status: "PENDING",
      },
    }),
    db.plantCareRule.update({ where: { id: rule.id }, data: { nextDueAt: dueAt } }),
  ]);

  return task;
}

export interface CareEventInput {
  performedAt?: Date;
  quantity?: number;
  unit?: string;
  method?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Enregistre un événement de soin pour une tâche existante : crée le
 * CareEvent, marque la tâche COMPLETED, puis génère la prochaine échéance
 * via la règle associée.
 */
export async function completeTaskWithEvent(taskId: string, type: CareEventType, input: CareEventInput) {
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { careRule: true },
  });

  const performedAt = input.performedAt ?? new Date();

  const event = await db.careEvent.create({
    data: {
      plantId: task.plantId,
      taskId: task.id,
      type,
      performedAt,
      quantity: input.quantity,
      unit: input.unit,
      note: input.note,
      metadata: toJsonInput(input.method ? { method: input.method, ...input.metadata } : input.metadata),
    },
  });

  await db.task.update({ where: { id: task.id }, data: { status: "COMPLETED", completedAt: performedAt } });

  if (task.careRule) {
    await ensurePendingTaskForRule(task.careRule, performedAt);
  }

  return event;
}

/**
 * Enregistre un événement de soin directement sur une plante (sans tâche
 * PENDING préalable, ex. arrosage spontané hors planning), puis rafraîchit
 * la tâche de la règle correspondante si elle existe.
 */
export async function recordStandaloneCareEvent(
  plantId: string,
  type: CareEventType,
  input: CareEventInput,
  careRuleId?: string,
) {
  const performedAt = input.performedAt ?? new Date();

  const event = await db.careEvent.create({
    data: {
      plantId,
      type,
      performedAt,
      quantity: input.quantity,
      unit: input.unit,
      note: input.note,
      metadata: toJsonInput(input.method ? { method: input.method, ...input.metadata } : input.metadata),
    },
  });

  if (careRuleId) {
    const pendingTask = await db.task.findFirst({ where: { careRuleId, status: "PENDING" } });
    if (pendingTask) {
      await db.task.update({ where: { id: pendingTask.id }, data: { status: "COMPLETED", completedAt: performedAt } });
    }
    const rule = await db.plantCareRule.findUnique({ where: { id: careRuleId } });
    if (rule) {
      await ensurePendingTaskForRule(rule, performedAt);
    }
  }

  return event;
}

/** Reporte une tâche sans jamais toucher à la règle de récurrence. */
export async function snoozeTaskById(taskId: string, until: Date) {
  return db.task.update({
    where: { id: taskId },
    data: { status: "SNOOZED", snoozedUntil: until },
  });
}

/**
 * Réagit à une nouvelle lecture de capteur : pour chaque règle d'arrosage
 * MOISTURE_THRESHOLD de la plante, crée une tâche due immédiatement si la
 * lecture passe sous le seuil configuré -- sans attendre le prochain cycle
 * de récurrence classique. Idempotent (ne crée jamais de doublon si une
 * tâche PENDING existe déjà pour la règle).
 */
export async function evaluateSensorReadingForTasks(sensor: Sensor, reading: SensorReading): Promise<void> {
  const rules = await db.plantCareRule.findMany({
    where: { plantId: sensor.plantId, enabled: true, recurrenceType: "MOISTURE_THRESHOLD" },
  });

  for (const rule of rules) {
    const triggered = shouldTriggerFromMoistureReading(sensor.type, reading.value, {
      recurrenceType: rule.recurrenceType,
      configuration: rule.configuration as { moistureThresholdPercent?: number } | null,
    });
    if (!triggered) {
      continue;
    }

    const existing = await db.task.findFirst({ where: { careRuleId: rule.id, status: "PENDING" } });
    if (existing) {
      continue;
    }

    const plant = await db.plant.findUniqueOrThrow({ where: { id: rule.plantId }, select: { name: true } });
    const dueAt = new Date();
    await db.$transaction([
      db.task.create({
        data: {
          plantId: rule.plantId,
          careRuleId: rule.id,
          type: mapRuleTypeToTaskType(rule.type),
          title: buildTaskTitle(rule.type, plant.name),
          dueAt,
          status: "PENDING",
          metadata: { triggeredBySensorId: sensor.id, readingValue: reading.value, readingUnit: reading.unit },
        },
      }),
      db.plantCareRule.update({ where: { id: rule.id }, data: { nextDueAt: dueAt } }),
    ]);
  }
}
