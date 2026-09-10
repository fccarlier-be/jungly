import { db } from "@/server/db";
import { sendDailyDigest } from "./notificationService";
import { refreshWeatherProfile } from "@/server/weather/refresh";

const QUARTER_HOUR_MS = 15 * 60 * 1000;

/**
 * Delai jusqu'au prochain quart d'heure pile (xxh00/15/30/45). Un quart
 * d'heure dure toujours 900 000 ms, et les fuseaux europeens ont un decalage
 * en heures pleines : les quarts d'heure en epoch UTC coincident donc avec
 * les quarts d'heure en heure locale, pas besoin de conversion de fuseau ici.
 */
function delayToNextQuarterHour(now: number = Date.now()): number {
  const remainder = now % QUARTER_HOUR_MS;
  return remainder === 0 ? QUARTER_HOUR_MS : QUARTER_HOUR_MS - remainder;
}

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

/**
 * Rafraichit une fois par jour l'ajustement meteo de chaque utilisateur qui
 * a renseigne une ville (voir src/server/weather/). `updatedAt` sert
 * directement de marqueur "deja fait aujourd'hui", pas besoin d'un champ
 * dedie.
 */
async function tickWeather(): Promise<void> {
  const now = new Date();
  const profiles = await db.weatherProfile.findMany();

  for (const profile of profiles) {
    if (isSameDay(profile.updatedAt, now)) {
      continue;
    }
    try {
      await refreshWeatherProfile(profile);
    } catch (error) {
      console.error(`[weather] échec du rafraîchissement pour l'utilisateur ${profile.userId} :`, error);
    }
  }
}

// Sans ca, un capteur legitime a 1 mesure/minute produit ~525 600
// lectures/an -- SQLite/Prisma commencent a souffrir sur les requetes
// historiques bien avant que ce chiffre devienne confortable. Pas de
// downsampling/agregation (sur-ingenierie tant qu'aucun capteur reel n'est
// branche, voir README) : purge brute au-dela de 90 jours.
const SENSOR_READING_RETENTION_DAYS = 90;
let lastSensorPurgeDay: Date | null = null;

async function tickSensorRetention(): Promise<void> {
  const now = new Date();
  if (lastSensorPurgeDay && isSameDay(lastSensorPurgeDay, now)) {
    return;
  }
  const cutoff = new Date(now.getTime() - SENSOR_READING_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    const { count } = await db.sensorReading.deleteMany({ where: { recordedAt: { lt: cutoff } } });
    if (count > 0) {
      console.log(`[sensors] purge : ${count} lecture(s) de plus de ${SENSOR_READING_RETENTION_DAYS} jours supprimée(s).`);
    }
    lastSensorPurgeDay = now;
  } catch (error) {
    console.error("[sensors] échec de la purge des lectures :", error);
  }
}

let started = false;

/**
 * Démarre le scheduler de digest quotidien en mémoire, dans le process
 * Next.js lui-même (pas de cron hôte nécessaire : le conteneur est un
 * process Node persistant, pas serverless). Une vérification immédiate
 * rattrape un digest manqué (redémarrage après l'heure prévue), puis les
 * vérifications suivantes sont recalées sur les quarts d'heure pile
 * (xxh00/15/30/45) plutôt que toutes les 15 minutes depuis le démarrage du
 * conteneur -- sinon l'heure choisie par l'utilisateur (elle-même restreinte
 * aux quarts d'heure, voir validation/notification.ts) pouvait être
 * atteinte jusqu'à 14 minutes avant d'être détectée.
 */
export function startNotificationScheduler(): void {
  if (started) {
    return;
  }
  started = true;

  console.log("[notifications] scheduler demarre (verification immediate puis a chaque quart d'heure pile).");

  function loop(): void {
    tick().catch((error) => console.error("[notifications] verification echouee :", error));
    tickWeather().catch((error) => console.error("[weather] verification echouee :", error));
    tickSensorRetention().catch((error) => console.error("[sensors] verification echouee :", error));
    setTimeout(loop, delayToNextQuarterHour());
  }

  tick().catch((error) => console.error("[notifications] première vérification échouée :", error));
  tickWeather().catch((error) => console.error("[weather] première vérification échouée :", error));
  tickSensorRetention().catch((error) => console.error("[sensors] première vérification échouée :", error));
  setTimeout(loop, delayToNextQuarterHour());
}
