import { Prisma, type CareEventType, type PlantCareRule, type Sensor, type SensorReading, type TaskStatus } from "@prisma/client";
import { db } from "@/server/db";
import { ConflictError } from "@/lib/apiError";
import { buildTaskTitle, computeRuleNextDueDate, mapRuleTypeToTaskType, type RuleConfiguration } from "./taskGenerator";
import { shouldTriggerFromMoistureReading } from "./sensorTrigger";

const COMPLETABLE_STATUSES: TaskStatus[] = ["PENDING", "SNOOZED"];

function toJsonInput(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  return value as Prisma.InputJsonValue | undefined;
}

/**
 * Crée la prochaine tâche PENDING d'une règle si elle n'existe pas déjà.
 * Idempotent : n'insère jamais un doublon si une tâche PENDING est déjà
 * associée à cette règle.
 */
export async function ensurePendingTaskForRule(
  rule: PlantCareRule,
  fromDate: Date = new Date(),
  tx?: Prisma.TransactionClient,
) {
  // Accepte un client de transaction optionnel pour pouvoir etre appelee
  // depuis l'interieur d'une transaction englobante (ex. import JSON) sans
  // ouvrir de transaction imbriquee (non supporte par Prisma).
  const client = tx ?? db;

  const existing = await client.task.findFirst({
    where: { careRuleId: rule.id, status: "PENDING" },
  });
  if (existing) {
    return existing;
  }

  // L'ajustement meteo ne concerne que l'arrosage -- pas de requete
  // supplementaire pour les autres types de regle.
  let wateringIntervalMultiplier = 1;
  if (rule.type === "WATERING") {
    const weatherProfile = await client.weatherProfile.findFirst({
      where: { user: { plants: { some: { id: rule.plantId } } } },
      select: { wateringIntervalMultiplier: true },
    });
    wateringIntervalMultiplier = weatherProfile?.wateringIntervalMultiplier ?? 1;
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
    wateringIntervalMultiplier,
  );
  if (dueAt == null) {
    return null;
  }

  const plant = await client.plant.findUniqueOrThrow({ where: { id: rule.plantId }, select: { name: true } });

  const taskData = {
    plantId: rule.plantId,
    careRuleId: rule.id,
    type: mapRuleTypeToTaskType(rule.type),
    title: buildTaskTitle(rule.type, plant.name),
    dueAt,
    status: "PENDING" as const,
  };

  if (tx) {
    const task = await tx.task.create({ data: taskData });
    await tx.plantCareRule.update({ where: { id: rule.id }, data: { nextDueAt: dueAt } });
    return task;
  }

  const [task] = await db.$transaction([
    db.task.create({ data: taskData }),
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

  // Sans ce garde-fou, une tache deja COMPLETED/SKIPPED pouvait etre
  // completee une seconde fois : un 2e CareEvent tentait de reutiliser le
  // meme taskId (@unique dans le schema), ce qui remontait comme une
  // erreur 500 generique au lieu d'un message clair.
  if (!COMPLETABLE_STATUSES.includes(task.status)) {
    throw new ConflictError("Cette tâche a déjà été traitée.");
  }

  const performedAt = input.performedAt ?? new Date();

  // Creation de l'evenement + passage a COMPLETED dans une seule transaction :
  // si l'un des deux echoue, l'autre ne doit pas rester applique seul.
  const [event] = await db.$transaction([
    db.careEvent.create({
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
    }),
    db.task.update({ where: { id: task.id }, data: { status: "COMPLETED", completedAt: performedAt } }),
  ]);

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
    // careRuleId vient du client (voir waterEventSchema etc.) : sans le
    // filtre plantId ici, un utilisateur pouvait fournir l'id d'une regle
    // appartenant a une AUTRE plante -- y compris d'un autre utilisateur --
    // et en completer/regenerer la tache depuis sa propre plante.
    const rule = await db.plantCareRule.findFirst({ where: { id: careRuleId, plantId } });
    if (rule) {
      const pendingTask = await db.task.findFirst({ where: { careRuleId, plantId, status: "PENDING" } });
      if (pendingTask) {
        await db.task.update({ where: { id: pendingTask.id }, data: { status: "COMPLETED", completedAt: performedAt } });
      }
      await ensurePendingTaskForRule(rule, performedAt);
    }
  }

  return event;
}

/** Reporte une tâche sans jamais toucher à la règle de récurrence. */
export async function snoozeTaskById(taskId: string, until: Date) {
  const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });
  if (!COMPLETABLE_STATUSES.includes(task.status)) {
    throw new ConflictError("Cette tâche a déjà été traitée.");
  }

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
