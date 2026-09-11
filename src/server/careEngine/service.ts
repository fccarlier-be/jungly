import { Prisma, type CareEventType, type PlantCareRule, type Sensor, type SensorReading, type TaskStatus } from "@generated/prisma/client";
import { db } from "@/server/db";
import { ConflictError } from "@/lib/apiError";
import { buildTaskTitle, computeRuleNextDueDate, mapRuleTypeToTaskType, type RuleConfiguration } from "./taskGenerator";
import { shouldTriggerFromMoistureReading } from "./sensorTrigger";

const COMPLETABLE_STATUSES: TaskStatus[] = ["PENDING", "SNOOZED"];

function toJsonInput(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  return value as Prisma.InputJsonValue | undefined;
}

/**
 * Crée la prochaine tâche PENDING d'une règle si elle n'a pas déjà de tâche
 * active. Idempotent : n'insère jamais un doublon si une tâche PENDING *ou
 * SNOOZED* est déjà associée à cette règle (une tâche reportée reste une
 * tâche active, pas un slot libre).
 */
export async function ensurePendingTaskForRule(
  rule: PlantCareRule,
  fromDate: Date = new Date(),
  tx?: Prisma.TransactionClient,
) {
  // Accepte un client de transaction optionnel pour pouvoir etre appelee
  // depuis l'interieur d'une transaction englobante (ex. import JSON) sans
  // ouvrir de transaction imbriquee (non supporte par Prisma). Sinon, la
  // lecture (existe-t-il deja un PENDING ?) et l'ecriture sont englobees
  // dans une transaction dediee : sans ca, deux appels concurrents pouvaient
  // chacun constater l'absence de tache PENDING avant que l'un des deux
  // n'ecrive, produisant deux taches PENDING pour la meme regle.
  if (tx) {
    return ensurePendingTaskForRuleWithClient(rule, fromDate, tx);
  }
  return db.$transaction((innerTx) => ensurePendingTaskForRuleWithClient(rule, fromDate, innerTx));
}

async function ensurePendingTaskForRuleWithClient(
  rule: PlantCareRule,
  fromDate: Date,
  client: Prisma.TransactionClient,
) {
  // PENDING et SNOOZED comptent tous les deux comme "tache active" pour
  // cette regle -- sinon un arrosage spontane (recordStandaloneCareEvent)
  // pendant qu'une tache est reportee (SNOOZED) laissait cette derniere
  // orpheline tout en creant une nouvelle PENDING a cote.
  const existing = await client.task.findFirst({
    where: { careRuleId: rule.id, status: { in: ["PENDING", "SNOOZED"] } },
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

  const task = await client.task.create({
    data: {
      plantId: rule.plantId,
      careRuleId: rule.id,
      type: mapRuleTypeToTaskType(rule.type),
      title: buildTaskTitle(rule.type),
      dueAt,
      status: "PENDING",
    },
  });
  await client.plantCareRule.update({ where: { id: rule.id }, data: { nextDueAt: dueAt } });

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
  const performedAt = input.performedAt ?? new Date();

  // Verification ET transition du statut dans une seule operation atomique
  // (updateMany conditionnel), a l'interieur de la transaction -- pas un
  // findUnique() suivi d'un update() separes. Sans ca, deux requetes
  // concurrentes pouvaient toutes les deux lire PENDING avant que l'une des
  // deux ne commit : la seconde tombait alors sur un P2002 brut (contrainte
  // CareEvent.taskId @unique) au lieu du ConflictError propre ci-dessous.
  // Creation de l'evenement, passage a COMPLETED et generation de la
  // prochaine echeance dans la meme transaction : sans ca, un echec de
  // ensurePendingTaskForRule() (ex. panne DB) pouvait laisser un CareEvent
  // et une tache COMPLETED sans que la regle recurrente ne produise sa
  // suivante -- l'invariant "une tache recurrente completee doit produire
  // la suivante" n'etait pas atomique.
  return db.$transaction(async (tx) => {
    const { count } = await tx.task.updateMany({
      where: { id: taskId, status: { in: COMPLETABLE_STATUSES } },
      data: { status: "COMPLETED", completedAt: performedAt },
    });
    if (count === 0) {
      throw new ConflictError("Cette tâche a déjà été traitée.");
    }

    const task = await tx.task.findUniqueOrThrow({ where: { id: taskId }, include: { careRule: true } });

    const event = await tx.careEvent.create({
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

    if (task.careRule) {
      await ensurePendingTaskForRule(task.careRule, performedAt, tx);
    }

    return event;
  });
}

/**
 * Enregistre un événement de soin directement sur une plante (sans tâche
 * PENDING préalable, ex. arrosage spontané hors planning), puis rafraîchit
 * la tâche de la règle correspondante si elle existe. Accepte un client de
 * transaction optionnel (meme schema que ensurePendingTaskForRule) pour
 * pouvoir etre englobee dans une transaction plus large par l'appelant (ex.
 * repot, qui doit aussi mettre a jour la plante de facon atomique).
 */
export async function recordStandaloneCareEvent(
  plantId: string,
  type: CareEventType,
  input: CareEventInput,
  careRuleId?: string,
  tx?: Prisma.TransactionClient,
) {
  if (tx) {
    return recordStandaloneCareEventWithClient(plantId, type, input, careRuleId, tx);
  }
  return db.$transaction((innerTx) => recordStandaloneCareEventWithClient(plantId, type, input, careRuleId, innerTx));
}

async function recordStandaloneCareEventWithClient(
  plantId: string,
  type: CareEventType,
  input: CareEventInput,
  careRuleId: string | undefined,
  client: Prisma.TransactionClient,
) {
  const performedAt = input.performedAt ?? new Date();

  const event = await client.careEvent.create({
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
    const rule = await client.plantCareRule.findFirst({ where: { id: careRuleId, plantId } });
    if (rule) {
      // SNOOZED inclus : un arrosage spontane pendant qu'une tache est
      // reportee doit la completer, pas la laisser orpheline (voir
      // ensurePendingTaskForRule() ci-dessus, qui ne recree plus rien tant
      // qu'une tache active -- PENDING ou SNOOZED -- existe deja).
      const pendingTask = await client.task.findFirst({ where: { careRuleId, plantId, status: { in: ["PENDING", "SNOOZED"] } } });
      if (pendingTask) {
        await client.task.update({ where: { id: pendingTask.id }, data: { status: "COMPLETED", completedAt: performedAt } });
      }
      await ensurePendingTaskForRule(rule, performedAt, client);
    }
  }

  return event;
}

/**
 * Reporte une tâche sans jamais toucher à la règle de récurrence.
 *
 * Vérification ET transition du statut dans une seule operation atomique
 * (updateMany conditionnel), comme completeTaskWithEvent() -- meme race
 * sinon possible : deux requetes concurrentes (ex. /complete et /snooze sur
 * la meme tache) pouvaient toutes les deux lire PENDING avant que l'une des
 * deux ne commit, laissant la tache SNOOZED alors qu'un CareEvent existe
 * deja pour elle.
 */
export async function snoozeTaskById(taskId: string, until: Date) {
  const { count } = await db.task.updateMany({
    where: { id: taskId, status: { in: COMPLETABLE_STATUSES } },
    data: { status: "SNOOZED", snoozedUntil: until },
  });
  if (count === 0) {
    throw new ConflictError("Cette tâche a déjà été traitée.");
  }
  return db.task.findUniqueOrThrow({ where: { id: taskId } });
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

    // Lecture (tache PENDING existante ?) et ecriture englobees dans une
    // seule transaction, comme pour ensurePendingTaskForRule() -- meme
    // raisonnement : sans ca, deux lectures de capteur rapprochees
    // pouvaient chacune constater l'absence de tache avant que l'une des
    // deux n'ecrive.
    await db.$transaction(async (tx) => {
      const existing = await tx.task.findFirst({ where: { careRuleId: rule.id, status: { in: ["PENDING", "SNOOZED"] } } });
      if (existing) {
        return;
      }

      const dueAt = new Date();
      await tx.task.create({
        data: {
          plantId: rule.plantId,
          careRuleId: rule.id,
          type: mapRuleTypeToTaskType(rule.type),
          title: buildTaskTitle(rule.type),
          dueAt,
          status: "PENDING",
          metadata: { triggeredBySensorId: sensor.id, readingValue: reading.value, readingUnit: reading.unit },
        },
      });
      await tx.plantCareRule.update({ where: { id: rule.id }, data: { nextDueAt: dueAt } });
    });
  }
}
