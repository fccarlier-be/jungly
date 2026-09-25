import type { Prisma } from "@generated/prisma/client";
import { db } from "@/server/db";
import { FOLLOW_UP_DAYS, isSick, type HealthLevel } from "@/lib/plantHealth";

export interface HealthCheck {
  level: HealthLevel;
  performedAt: Date;
  symptoms: string[];
  note: string | null;
}

export interface HealthSummary {
  // Du plus recent au plus ancien, limite a HISTORY_LIMIT.
  history: HealthCheck[];
  current: HealthCheck;
  previous: HealthCheck | null;
}

const HISTORY_LIMIT = 12;

function readSymptoms(metadata: Prisma.JsonValue | null): string[] {
  const symptoms = (metadata as { symptoms?: unknown } | null)?.symptoms;
  return Array.isArray(symptoms) ? symptoms.filter((s): s is string => typeof s === "string") : [];
}

/**
 * Derniers releves de sante de plusieurs plantes en une seule requete.
 * Les plantes sans aucun releve sont absentes de la Map (etat inconnu --
 * jamais suppose "en bonne sante").
 */
export async function getHealthSummaries(plantIds: string[]): Promise<Map<string, HealthSummary>> {
  const summaries = new Map<string, HealthSummary>();
  if (plantIds.length === 0) return summaries;

  const events = await db.careEvent.findMany({
    where: { plantId: { in: plantIds }, healthLevel: { not: null } },
    orderBy: [{ performedAt: "desc" }, { createdAt: "desc" }],
    select: { plantId: true, healthLevel: true, performedAt: true, metadata: true, note: true },
  });

  const historyByPlant = new Map<string, HealthCheck[]>();
  for (const ev of events) {
    const list = historyByPlant.get(ev.plantId) ?? [];
    if (list.length >= HISTORY_LIMIT) continue;
    list.push({ level: ev.healthLevel as HealthLevel, performedAt: ev.performedAt, symptoms: readSymptoms(ev.metadata), note: ev.note });
    historyByPlant.set(ev.plantId, list);
  }
  for (const [plantId, history] of historyByPlant) {
    summaries.set(plantId, { history, current: history[0], previous: history[1] ?? null });
  }
  return summaries;
}

export const HEALTH_FOLLOW_UP_TITLE = "Inspection de suivi (santé)";

function isFollowUpTask(task: { metadata: Prisma.JsonValue | null }): boolean {
  return (task.metadata as { healthFollowUp?: unknown } | null)?.healthFollowUp === true;
}

/**
 * Aligne les inspections de suivi sur le dernier releve de sante de la
 * plante : tant qu'elle est malade (POOR/CRITICAL), une seule tache
 * INSPECTION de suivi est active, due FOLLOW_UP_DAYS apres le dernier
 * releve ; des qu'elle va mieux, la tache de suivi en attente est
 * abandonnee (SKIPPED). A appeler apres chaque evenement INSPECTION, dans
 * la meme transaction.
 *
 * Les taches de suivi n'ont pas de regle (careRuleId null) et sont
 * marquees metadata.healthFollowUp -- elles ne touchent jamais une tache
 * d'inspection creee autrement.
 */
export async function syncHealthFollowUp(plantId: string, client: Prisma.TransactionClient, now: Date = new Date()) {
  const latest = await client.careEvent.findFirst({
    where: { plantId, healthLevel: { not: null } },
    orderBy: [{ performedAt: "desc" }, { createdAt: "desc" }],
    select: { healthLevel: true, performedAt: true },
  });

  const activeFollowUps = (
    await client.task.findMany({
      where: { plantId, type: "INSPECTION", careRuleId: null, status: { in: ["PENDING", "SNOOZED"] } },
    })
  ).filter(isFollowUpTask);

  const level = latest?.healthLevel as HealthLevel | undefined;
  if (!latest || !isSick(level)) {
    for (const task of activeFollowUps) {
      await client.task.update({ where: { id: task.id }, data: { status: "SKIPPED" } });
    }
    return null;
  }

  // Jamais une echeance deja passee : un releve saisi a posteriori (date
  // ancienne) planifie le suivi a partir d'aujourd'hui.
  const base = latest.performedAt > now ? latest.performedAt : now;
  const dueAt = new Date(base);
  dueAt.setDate(dueAt.getDate() + FOLLOW_UP_DAYS[level]);

  const [keep, ...duplicates] = activeFollowUps;
  for (const task of duplicates) {
    await client.task.update({ where: { id: task.id }, data: { status: "SKIPPED" } });
  }
  if (keep) {
    return client.task.update({ where: { id: keep.id }, data: { dueAt, status: "PENDING", snoozedUntil: null } });
  }
  return client.task.create({
    data: {
      plantId,
      type: "INSPECTION",
      title: HEALTH_FOLLOW_UP_TITLE,
      description: "Plante en convalescence : note son état de santé.",
      dueAt,
      status: "PENDING",
      metadata: { healthFollowUp: true },
    },
  });
}
