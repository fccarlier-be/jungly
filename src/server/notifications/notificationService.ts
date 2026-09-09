import { db } from "@/server/db";
import { dueTasksWhere } from "@/server/careEngine/dueTasks";
import { sendPushToUser, type PushPayload } from "./webPush";

export interface DigestCounts {
  dueTodayCount: number;
  overdueCount: number;
  upcomingCount: number;
  advanceReminderDays: number;
}

/**
 * Construit le message du digest quotidien (fonction pure, testée).
 * Renvoie null si rien ne justifie une notification (aucune tâche due ni à
 * venir) : un digest agrégé plutôt qu'une notification par tâche, pour
 * éviter le spam si plusieurs plantes sont dues le même jour.
 */
export function buildDailyDigestMessage(counts: DigestCounts): PushPayload | null {
  const { dueTodayCount, overdueCount, upcomingCount, advanceReminderDays } = counts;
  const activeToday = dueTodayCount + overdueCount;

  if (activeToday === 0 && upcomingCount === 0) {
    return null;
  }

  let body: string;
  if (activeToday === 0) {
    body = `Rien pour aujourd'hui, mais ${upcomingCount} tâche${upcomingCount > 1 ? "s" : ""} à venir sous ${advanceReminderDays} jours.`;
  } else {
    const parts = [`${activeToday} tâche${activeToday > 1 ? "s" : ""} vous attend${activeToday > 1 ? "ent" : ""} aujourd'hui`];
    if (overdueCount > 0) {
      parts.push(`dont ${overdueCount} en retard`);
    }
    body = `${parts.join(" ")}.`;
    if (upcomingCount > 0) {
      body += ` ${upcomingCount} autre${upcomingCount > 1 ? "s" : ""} à venir sous ${advanceReminderDays} jours.`;
    }
  }

  return {
    title: overdueCount > 0 ? "⚠️ Jungly" : "💧 Jungly",
    body,
    url: "/",
  };
}

/**
 * Calcule et envoie le digest quotidien d'un utilisateur, puis met à jour
 * `lastDigestSentAt`. À appeler au plus une fois par jour et par
 * utilisateur (voir scheduler.ts pour la logique de déclenchement).
 */
export async function sendDailyDigest(userId: string): Promise<void> {
  const preference = await db.notificationPreference.findUnique({ where: { userId } });
  if (!preference?.enabled) {
    return;
  }

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const dueTasks = await db.task.findMany({
    where: { plant: { userId }, ...dueTasksWhere(endOfToday) },
    select: { dueAt: true },
  });
  const overdueCount = dueTasks.filter((t) => t.dueAt < startOfToday).length;
  const dueTodayCount = dueTasks.length - overdueCount;

  let upcomingCount = 0;
  if (preference.advanceReminderDays > 0) {
    const upcomingUntil = new Date(endOfToday);
    upcomingUntil.setDate(upcomingUntil.getDate() + preference.advanceReminderDays);
    upcomingCount = await db.task.count({
      where: {
        plant: { userId },
        status: "PENDING",
        dueAt: { gt: endOfToday, lte: upcomingUntil },
      },
    });
  }

  const overdueCounted = preference.overdueEnabled ? overdueCount : 0;
  const message = buildDailyDigestMessage({
    dueTodayCount,
    overdueCount: overdueCounted,
    upcomingCount,
    advanceReminderDays: preference.advanceReminderDays,
  });

  if (message) {
    await sendPushToUser(userId, message);
  }

  await db.notificationPreference.update({ where: { userId }, data: { lastDigestSentAt: now } });
}
