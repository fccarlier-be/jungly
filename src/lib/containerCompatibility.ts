/**
 * Detection de conflits entre plantes d'une meme jardiniere -- retour beta
 * 2026-09-17 ("je peux mettre de l'origan avec un pothos avec un
 * begonia"). Pures fonctions sans dependance serveur (importables depuis un
 * composant client comme depuis une page serveur) : jamais de blocage, ces
 * fonctions ne font que produire des avertissements en langage clair.
 */

export type SubstrateType = "UNIVERSAL" | "DRAINING" | "MOISTURE_RETAINING" | "ACIDIC" | "AQUATIC" | "EPIPHYTE" | "MINERAL";

export const SUBSTRATE_TYPE_OPTIONS: { value: SubstrateType; label: string }[] = [
  { value: "UNIVERSAL", label: "Universel" },
  { value: "DRAINING", label: "Drainant (cactées/succulentes)" },
  { value: "MOISTURE_RETAINING", label: "Retient l'humidité" },
  { value: "ACIDIC", label: "Acide (tourbe)" },
  { value: "AQUATIC", label: "Aquatique" },
  { value: "EPIPHYTE", label: "Épiphyte (orchidées)" },
  { value: "MINERAL", label: "Minéral pur (semi-hydroponie/LECA)" },
];

const SUBSTRATE_LABEL: Record<SubstrateType, string> = Object.fromEntries(
  SUBSTRATE_TYPE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<SubstrateType, string>;

/** Ecart minimal (rapport le plus assoiffe / le plus sobre) qui declenche un avertissement. */
export const WATERING_MISMATCH_RATIO = 1.5;

interface WateringRuleLike {
  enabled: boolean;
  recurrenceType: string;
  interval: number | null;
}

/**
 * Normalise en jours -- seuls les types a intervalle fixe sont comparables.
 * MANUAL/EXACT_DATE/YEARLY/MOISTURE_THRESHOLD n'ont pas d'equivalent
 * numerique fiable : on ne devine pas, on renvoie null (exclu du calcul).
 */
export function normalizeWateringIntervalDays(rule: WateringRuleLike | null | undefined): number | null {
  if (!rule || !rule.enabled || rule.interval == null) return null;
  switch (rule.recurrenceType) {
    case "FIXED_INTERVAL_DAYS":
      return rule.interval;
    case "INTERVAL_WEEKS":
      return rule.interval * 7;
    case "INTERVAL_MONTHS":
      return rule.interval * 30;
    default:
      return null;
  }
}

export interface CompatibilityPlant {
  id: string;
  name: string;
  substrateType: SubstrateType | null;
  wateringIntervalDays: number | null;
}

export interface CompatibilityWarning {
  kind: "watering" | "substrate";
  message: string;
}

/**
 * Compare toutes les plantes d'un meme groupe (jardiniere existante, ou
 * occupants + candidat avant assignation) -- jamais un verdict binaire
 * "compatible/incompatible", seulement une liste de points d'attention.
 */
export function checkContainerCompatibility(plants: CompatibilityPlant[]): CompatibilityWarning[] {
  const warnings: CompatibilityWarning[] = [];

  const withWatering = plants.filter(
    (p): p is CompatibilityPlant & { wateringIntervalDays: number } => p.wateringIntervalDays != null,
  );
  if (withWatering.length >= 2) {
    const sorted = [...withWatering].sort((a, b) => a.wateringIntervalDays - b.wateringIntervalDays);
    const thirstiest = sorted[0];
    const driest = sorted[sorted.length - 1];
    if (driest.wateringIntervalDays / thirstiest.wateringIntervalDays >= WATERING_MISMATCH_RATIO) {
      warnings.push({
        kind: "watering",
        message: `${thirstiest.name} (arrosée tous les ${thirstiest.wateringIntervalDays} j) et ${driest.name} (tous les ${driest.wateringIntervalDays} j) ont des besoins en eau très différents.`,
      });
    }
  }

  const withSubstrate = plants.filter(
    (p): p is CompatibilityPlant & { substrateType: SubstrateType } => p.substrateType != null,
  );
  const distinctSubstrates = new Set(withSubstrate.map((p) => p.substrateType));
  if (distinctSubstrates.size >= 2) {
    const grouped = new Map<SubstrateType, string[]>();
    for (const p of withSubstrate) {
      grouped.set(p.substrateType, [...(grouped.get(p.substrateType) ?? []), p.name]);
    }
    const parts = [...grouped.entries()].map(([type, names]) => `${SUBSTRATE_LABEL[type]} (${names.join(", ")})`);
    warnings.push({
      kind: "substrate",
      message: `Substrats différents dans cette jardinière : ${parts.join(" vs ")}.`,
    });
  }

  return warnings;
}
