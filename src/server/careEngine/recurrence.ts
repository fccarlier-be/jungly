import type { RecurrenceType } from "@generated/prisma/client";

export interface RecurrenceRule {
  recurrenceType: RecurrenceType;
  interval: number | null;
  /** Utilisé seulement pour EXACT_DATE : date ISO de la prochaine échéance fixe. */
  exactDate?: string | null;
}

// Recurrences a l'echelle de la vie de la plante (mois/annees) : pour elles,
// l'age de la plante est une meilleure base que "aujourd'hui". Les
// recurrences courtes (jours/semaines) suivent un rythme de routine
// (arrosage...), sans rapport avec la date d'acquisition.
const LONG_RECURRENCES: ReadonlySet<RecurrenceType> = new Set(["INTERVAL_MONTHS", "YEARLY"]);

/**
 * Date de reference pour la toute premiere echeance d'une regle qui vient
 * d'etre creee, sans aucun historique de soin a lui substituer (ni creation
 * manuelle, ni import de sauvegarde) -- voir ensurePendingTaskForRule().
 *
 * Retour utilisateur (ticket #6, 2026-10-01) : une regle "rempoter tous les
 * 24 mois" ajoutee a une plante acquise il y a un an doit tomber dans 12
 * mois, pas dans 24 -- sans ca, chaque nouvelle plante repart comme si elle
 * venait d'arriver, meme avec une date d'acquisition renseignee.
 *
 * N'importe jamais un acquiredAt dans le futur (saisie en avance) : la
 * reference reste alors la date du jour, comme avant ce correctif.
 */
export function firstDueDateBasis(recurrenceType: RecurrenceType, acquiredAt: Date | null | undefined, today: Date = new Date()): Date {
  if (acquiredAt && LONG_RECURRENCES.has(recurrenceType) && acquiredAt.getTime() <= today.getTime()) {
    return acquiredAt;
  }
  return today;
}

/**
 * Calcule la prochaine échéance à partir d'une date de référence (en général
 * la date du dernier événement de soin) et de la règle de récurrence.
 *
 * Ne renvoie jamais une date "devinée" sans règle : MANUAL et
 * MOISTURE_THRESHOLD n'ont pas d'échéance calculable ici (voir seasonal.ts /
 * les capteurs pour MOISTURE_THRESHOLD).
 */
export function computeNextDueDate(rule: RecurrenceRule, fromDate: Date): Date | null {
  const from = new Date(fromDate);

  switch (rule.recurrenceType) {
    case "FIXED_INTERVAL_DAYS": {
      const days = requirePositiveInterval(rule.interval, "FIXED_INTERVAL_DAYS");
      return addDays(from, days);
    }
    case "INTERVAL_WEEKS": {
      const weeks = requirePositiveInterval(rule.interval, "INTERVAL_WEEKS");
      return addDays(from, weeks * 7);
    }
    case "INTERVAL_MONTHS": {
      const months = requirePositiveInterval(rule.interval, "INTERVAL_MONTHS");
      return addMonths(from, months);
    }
    case "YEARLY": {
      return addMonths(from, 12);
    }
    case "EXACT_DATE": {
      if (!rule.exactDate) {
        throw new Error("EXACT_DATE requiert une date (exactDate) dans la configuration de la règle.");
      }
      return new Date(rule.exactDate);
    }
    case "MANUAL":
    case "MOISTURE_THRESHOLD":
      return null;
    default:
      return null;
  }
}

function requirePositiveInterval(interval: number | null, type: string): number {
  if (interval == null || interval <= 0) {
    throw new Error(`La règle ${type} nécessite un intervalle strictement positif.`);
  }
  return interval;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * `Date.setMonth()` seul ne clampe pas : un 31 janvier + 1 mois deborde sur
 * le 3 mars (fevrier n'a que 28/29 jours) au lieu du 28/29 fevrier attendu.
 * On repasse au jour 1 avant de changer de mois (evite le debordement le
 * temps du changement), puis on clampe au dernier jour valide du mois
 * cible.
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const daysInTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, daysInTargetMonth));
  return result;
}
