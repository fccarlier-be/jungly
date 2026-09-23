/**
 * Types partages du diagnostic de sante par photo (QCM adaptatif +
 * Pl@ntNet + moteur de regles local -- voir docs/architecture ou la
 * conversation d'origine pour le contexte complet). Ce fichier est le
 * CONTRAT entre les modules : qcmTree.ts / photoGuidance.ts / ruleEngine.ts
 * / localContext.ts / la route d'orchestration / le front -- ne pas
 * dupliquer ces formes ailleurs.
 */

// Categorie racine du QCM -- correspond exactement a HealthDiagnosis.symptomCategory
// (prisma/schema.prisma). Garder les deux synchronises si cette liste change.
export const SYMPTOM_CATEGORIES = [
  "YELLOW_LEAVES",
  "BROWN_LEAVES",
  "DROPPING_LEAVES",
  "WILTING",
  "SPOTS",
  "PESTS",
  "ABNORMAL_GROWTH",
  "FLOWERING_ISSUE",
  "OTHER",
] as const;
export type SymptomCategory = (typeof SYMPTOM_CATEGORIES)[number];

export const SYMPTOM_CATEGORY_LABEL: Record<SymptomCategory, string> = {
  YELLOW_LEAVES: "Feuilles jaunes",
  BROWN_LEAVES: "Feuilles brunes",
  DROPPING_LEAVES: "Feuilles qui tombent",
  WILTING: "Feuilles molles / flétries",
  SPOTS: "Taches",
  PESTS: "Parasites visibles",
  ABNORMAL_GROWTH: "Croissance anormale",
  FLOWERING_ISSUE: "Problème de floraison",
  OTHER: "Autre",
};

/** Une question de suivi du QCM adaptatif, posee apres la categorie racine. */
export interface QcmOption {
  id: string;
  label: string;
}

export interface QcmQuestion {
  id: string;
  question: string;
  multiple: boolean;
  options: QcmOption[];
}

/**
 * Reponses du QCM au-dela de la categorie racine : cle = QcmQuestion.id,
 * valeur = QcmOption.id choisi (ou tableau si `multiple`). Json cote
 * Prisma (HealthDiagnosis.symptomAnswers) -- structure volontairement
 * libre pour ne pas migrer a chaque ajustement de l'arbre de questions.
 */
export type QcmAnswers = Record<string, string | string[]>;

export interface SymptomVector {
  category: SymptomCategory;
  answers: QcmAnswers;
}

// Les 5 seules valeurs acceptees par le parametre "organs" de l'API
// Pl@ntNet (verifie sur la doc officielle, docs.plantnet.org/reference/organs
// liste un glossaire plus large qui ne s'applique PAS a ce parametre) --
// reexporte depuis plantnet/client.ts pour eviter toute divergence.
import type { PlantnetOrgan } from "@/server/plantnet/client";
export type { PlantnetOrgan };

/**
 * Une photo demandee a l'utilisateur pour ce diagnostic. `id` sert de nom
 * de champ de formulaire cote route d'orchestration (`photo_<id>`) --
 * stable et connu du serveur (source de verite), jamais fourni par le
 * client.
 */
export interface PhotoRequest {
  id: string;
  label: string;
  organ: PlantnetOrgan;
  required: boolean;
}

/**
 * Contexte "etage 0" : ce que Jungly sait deja sur la plante, calcule a
 * partir de l'historique reel (CareEvent), de la regle theorique
 * (PlantCareRule), de la meteo recente (WeatherProfile) et du profil de
 * l'espece (PlantLibraryEntry.careProfile) -- voir localContext.ts.
 * Chaque champ null signifie "signal non disponible" (ex. pas de regle
 * d'arrosage definie), jamais "0"/"faux" par defaut : le moteur de regles
 * doit pouvoir distinguer "on sait que c'est normal" de "on ne sait pas".
 */
export interface LocalContext {
  wateringRuleIntervalDays: number | null;
  daysSinceLastWatering: number | null;
  /** > 0 = retard (jours au-dela de l'intervalle theorique), <= 0 = dans les temps. Null si pas de regle OU pas d'historique. */
  wateringGapDays: number | null;

  fertilizingRuleIntervalDays: number | null;
  daysSinceLastFertilizing: number | null;

  /** Moyenne des temperatures max recentes (voir computeWateringMultiplier) > 30. */
  recentHeatStress: boolean;
  /** Moyenne des temperatures max recentes < 15 alors qu'aucune regle saisonniere ne le prevoit. */
  recentColdSnap: boolean;

  /**
   * Comparaison texte libre Plant.exposure vs careProfile.exposure de la
   * fiche de bibliotheque -- heuristique par mots-cles (voir
   * localContext.ts), jamais une garantie. Null si l'un des deux manque
   * (rien a comparer).
   */
  exposureMismatch: boolean | null;

  substrate: string | null;
  substrateType: string | null;

  /** Derniers evenements de soin (le plus recent en premier), pour affichage/contexte -- pas d'interpretation ici. */
  recentEvents: Array<{ type: string; performedAt: string; note: string | null }>;

  /** Nombre de jours depuis l'acquisition, null si Plant.acquiredAt absent -- pertinent pour un choc de rempotage/acclimatation recent. */
  daysSinceAcquired: number | null;
}

export interface PlantnetDiseaseCandidate {
  /** Libelle lisible (champ `description` de l'API Pl@ntNet), jamais le code EPPO brut -- voir plantnet/client.ts. */
  name: string;
  eppoCode: string | null;
  score: number;
}

export type DiagnosisConfidence = "PROBABLE" | "POSSIBLE" | "PEU_PROBABLE";

export interface Hypothesis {
  id: string;
  label: string;
  confidence: DiagnosisConfidence;
  evidenceFor: string[];
  evidenceAgainst: string[];
  verifications: string[];
  actions: string[];
}

export interface PlantIdentification {
  scientificName: string | null;
  commonName: string | null;
  /** "existing" = deja connue de la fiche plante, "plantnet" = (re)confirmee par Pl@ntNet pour ce diagnostic, "unknown" = ni l'un ni l'autre. */
  source: "existing" | "plantnet" | "unknown";
}

export interface DiagnosisResult {
  plantIdentification: PlantIdentification;
  /** Observations factuelles (symptomes rapportes + resultat visuel Pl@ntNet le cas echeant) -- jamais une conclusion. */
  observations: string[];
  plantnetDisease: PlantnetDiseaseCandidate[] | null;
  hypotheses: Hypothesis[];
}
