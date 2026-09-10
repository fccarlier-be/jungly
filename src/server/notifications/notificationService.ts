import { db } from "@/server/db";
import { dueTasksWhere, effectiveDueDate, type DueCheckable } from "@/server/careEngine/dueTasks";
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
 * Separe les taches "en retard" des taches "dues aujourd'hui" selon leur
 * date effective (fonction pure, testee) : sans effectiveDueDate(), une
 * tache SNOOZED avec un vieux dueAt d'origine mais reportee a aujourd'hui
 * etait comptee a tort comme "en retard".
 */
export function splitOverdueAndDueToday(tasks: DueCheckable[], startOfToday: Date): { overdueCount: number; dueTodayCount: number } {
  const overdueCount = tasks.filter((t) => effectiveDueDate(t) < startOfToday).length;
  return { overdueCount, dueTodayCount: tasks.length - overdueCount };
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
    select: { dueAt: true, status: true, snoozedUntil: true },
  });
  const { overdueCount, dueTodayCount } = splitOverdueAndDueToday(dueTasks, startOfToday);

  let upcomingCount = 0;
  if (preference.advanceReminderDays > 0) {
    const upcomingUntil = new Date(endOfToday);
    upcomingUntil.setDate(upcomingUntil.getDate() + preference.advanceReminderDays);
    upcomingCount = await db.task.count({
      where: {
        plant: { userId },
        // Une tache reportee (SNOOZED) redevenant due demain est tout autant
        // "a venir" qu'une tache PENDING -- l'ignorer faisait manquer le
        // rappel anticipe des lors qu'une tache avait ete snoozee.
        OR: [
          { status: "PENDING", dueAt: { gt: endOfToday, lte: upcomingUntil } },
          { status: "SNOOZED", snoozedUntil: { gt: endOfToday, lte: upcomingUntil } },
        ],
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
