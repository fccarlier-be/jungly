import { db } from "@/server/db";
import { sendDailyDigest } from "./notificationService";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function hasReachedNotificationTime(notificationTime: string, now: Date): boolean {
  const [hours, minutes] = notificationTime.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return false;
  }
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  return now.getTime() >= target.getTime();
}

async function tick(): Promise<void> {
  const now = new Date();
  const preferences = await db.notificationPreference.findMany({ where: { enabled: true } });

  for (const preference of preferences) {
    const alreadySentToday = preference.lastDigestSentAt ? isSameDay(preference.lastDigestSentAt, now) : false;
    if (alreadySentToday || !hasReachedNotificationTime(preference.notificationTime, now)) {
      continue;
    }
    try {
      await sendDailyDigest(preference.userId);
    } catch (error) {
      console.error(`[notifications] échec du digest pour l'utilisateur ${preference.userId} :`, error);
    }
  }
}

let started = false;

/**
 * Démarre le scheduler de digest quotidien en mémoire, dans le process
 * Next.js lui-même (pas de cron hôte nécessaire : le conteneur est un
 * process Node persistant, pas serverless). Vérifie toutes les 15 minutes
 * si un utilisateur a atteint son heure de notification et n'a pas encore
 * reçu son digest aujourd'hui.
 */
export function startNotificationScheduler(): void {
  if (started) {
    return;
  }
  started = true;

  console.log("[notifications] scheduler demarre (verification toutes les 15 minutes).");

  tick().catch((error) => console.error("[notifications] première vérification échouée :", error));
  setInterval(() => {
    tick().catch((error) => console.error("[notifications] verification periodique echouee :", error));
  }, CHECK_INTERVAL_MS);
}
