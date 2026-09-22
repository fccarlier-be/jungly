/**
 * Construit le contexte "etage 0" d'un diagnostic : ce que Jungly sait deja
 * sur une plante avant meme de poser une question ou de prendre une photo
 * (ecart d'arrosage theorique/reel, stress meteo recent, decalage
 * d'exposition vs le profil de l'espece...). Aucune donnee ici ne quitte
 * jamais le serveur -- ni Pl@ntNet ni aucun service externe n'en a besoin,
 * voir le moteur de regles (ruleEngine.ts) qui les consomme localement.
 *
 * N'appelle jamais l'API meteo en direct : reutilise
 * WeatherProfile.wateringIntervalMultiplier, deja rafraichi une fois par
 * jour par le scheduler (voir src/server/weather/refresh.ts) -- inutile de
 * refaire un appel reseau a chaque diagnostic pour la meme information.
 */
import { db } from "@/server/db";
import { computeNextDueDate } from "@/server/careEngine/recurrence";
import type { LocalContext } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

type ExposureBucket = "high" | "medium" | "low";

// Heuristique par mots-cles pour comparer Plant.exposure (texte libre
// saisi par l'utilisateur) au careProfile.exposure d'une fiche de
// bibliotheque (aussi texte libre, genere par mapCareProfile -- voir
// perenual/mapping.ts, valeurs typiques "Plein soleil"/"Mi-ombre"/"Ombre").
// Volontairement approximatif : sert de PISTE a verifier dans le moteur de
// regles (exposureMismatch), jamais affiche seul comme un fait etabli.
const EXPOSURE_BUCKETS: Array<{ keywords: string[]; bucket: ExposureBucket }> = [
  { keywords: ["plein soleil", "direct"], bucket: "high" },
  { keywords: ["mi-ombre", "indirecte", "filtree", "filtrée"], bucket: "medium" },
  { keywords: ["ombre"], bucket: "low" },
];

function exposureBucket(text: string | null | undefined): ExposureBucket | null {
  if (!text) return null;
  const normalized = text.toLowerCase();
  for (const { keywords, bucket } of EXPOSURE_BUCKETS) {
    if (keywords.some((k) => normalized.includes(k))) return bucket;
  }
  return null;
}

/**
 * Ecart entre la prochaine echeance THEORIQUE (calculee depuis le dernier
 * evenement reel avec la meme logique que le CareEngine, voir recurrence.ts)
 * et aujourd'hui. > 0 = en retard. Renvoie [gap, intervalEnJours] ou
 * [null, null] si la regle n'a pas d'intervalle exploitable ici (MANUAL,
 * MOISTURE_THRESHOLD, EXACT_DATE) -- pas une erreur, juste un signal
 * indisponible pour ce type de regle.
 */
function computeGapDays(
  rule: { recurrenceType: Parameters<typeof computeNextDueDate>[0]["recurrenceType"]; interval: number | null } | null,
  lastEventAt: Date | null,
  now: Date,
): [number | null, number | null] {
  if (!rule || !lastEventAt) return [null, null];
  let theoreticalDue: Date | null;
  try {
    theoreticalDue = computeNextDueDate({ recurrenceType: rule.recurrenceType, interval: rule.interval }, lastEventAt);
  } catch {
    return [null, null]; // intervalle manquant/invalide -- signal indisponible, pas une erreur de diagnostic
  }
  if (!theoreticalDue) return [null, null];
  return [daysBetween(theoreticalDue, now), daysBetween(lastEventAt, theoreticalDue)];
}

export async function buildLocalContext(plantId: string, now: Date = new Date()): Promise<LocalContext> {
  const plant = await db.plant.findUniqueOrThrow({
    where: { id: plantId },
    include: {
      careRules: true,
      libraryEntry: { select: { careProfile: true } },
      user: { select: { weatherProfile: { select: { wateringIntervalMultiplier: true } } } },
    },
  });

  const wateringRule = plant.careRules.find((r) => r.type === "WATERING" && r.enabled) ?? null;
  const fertilizingRule = plant.careRules.find((r) => r.type === "FERTILIZING" && r.enabled) ?? null;

  const [lastWatering, lastFertilizing, recentEventsRaw] = await Promise.all([
    db.careEvent.findFirst({ where: { plantId, type: "WATERING" }, orderBy: { performedAt: "desc" } }),
    db.careEvent.findFirst({ where: { plantId, type: "FERTILIZING" }, orderBy: { performedAt: "desc" } }),
    db.careEvent.findMany({ where: { plantId }, orderBy: { performedAt: "desc" }, take: 10 }),
  ]);

  const daysSinceLastWatering = lastWatering ? daysBetween(lastWatering.performedAt, now) : null;
  const daysSinceLastFertilizing = lastFertilizing ? daysBetween(lastFertilizing.performedAt, now) : null;

  const [wateringGapDays, wateringRuleIntervalDays] = computeGapDays(wateringRule, lastWatering?.performedAt ?? null, now);
  const [, fertilizingRuleIntervalDays] = computeGapDays(fertilizingRule, lastFertilizing?.performedAt ?? null, now);

  const multiplier = plant.user.weatherProfile?.wateringIntervalMultiplier ?? 1;

  const plantBucket = exposureBucket(plant.exposure);
  const libraryBucket = exposureBucket((plant.libraryEntry?.careProfile as { exposure?: string } | null)?.exposure ?? null);

  return {
    wateringRuleIntervalDays,
    daysSinceLastWatering,
    wateringGapDays,
    fertilizingRuleIntervalDays,
    daysSinceLastFertilizing,
    // Seuils alignes sur computeWateringMultiplier (voir weather/multiplier.ts) :
    // <=0.85 couvre les deux paliers "chaleur"/"canicule", >1 est le seul
    // palier "frais".
    recentHeatStress: multiplier <= 0.85,
    recentColdSnap: multiplier > 1,
    exposureMismatch: plantBucket && libraryBucket ? plantBucket !== libraryBucket : null,
    substrate: plant.substrate,
    substrateType: plant.substrateType,
    recentEvents: recentEventsRaw.map((e) => ({ type: e.type, performedAt: e.performedAt.toISOString(), note: e.note })),
    daysSinceAcquired: plant.acquiredAt ? daysBetween(plant.acquiredAt, now) : null,
  };
}
