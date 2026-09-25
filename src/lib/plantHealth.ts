import type { PlantStatus } from "@/lib/plantStatus";

/**
 * Etat de sante releve a la main (CareEvent.healthLevel, sur une
 * INSPECTION). Pur et sans dependance serveur : utilisable cote client
 * (selecteur de niveau) comme cote serveur (statut, relances d'inspection).
 */

// Du meilleur au pire -- l'index sert a comparer deux releves (tendance).
export const HEALTH_LEVELS = ["EXCELLENT", "GOOD", "FAIR", "POOR", "CRITICAL"] as const;
export type HealthLevel = (typeof HEALTH_LEVELS)[number];

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  EXCELLENT: "Excellente",
  GOOD: "Bonne",
  FAIR: "Moyenne",
  POOR: "Mauvaise",
  CRITICAL: "Critique",
};

// Variables CSS existantes (globals.css), deja declinees en theme sombre --
// pas de nouvelle couleur a maintenir.
export const HEALTH_COLOR: Record<HealthLevel, string> = {
  EXCELLENT: "var(--primary)",
  GOOD: "var(--secondary)",
  FAIR: "var(--warning)",
  POOR: "var(--accent)",
  CRITICAL: "var(--danger)",
};

/** Plante "en convalescence" : pastille rouge, statut Attention, inspections de suivi. */
export function isSick(level: HealthLevel | null | undefined): level is "POOR" | "CRITICAL" {
  return level === "POOR" || level === "CRITICAL";
}

// Intervalle des inspections de suivi tant que la plante est malade : plus
// serre quand c'est critique.
export const FOLLOW_UP_DAYS: Record<"POOR" | "CRITICAL", number> = {
  POOR: 3,
  CRITICAL: 2,
};

export type HealthTrend = "improving" | "stable" | "worsening";

export const TREND_LABEL: Record<HealthTrend, string> = {
  improving: "en amélioration",
  stable: "stable",
  worsening: "en dégradation",
};

/** Tendance entre deux releves successifs, null s'il n'y a pas de releve precedent. */
export function computeHealthTrend(current: HealthLevel, previous: HealthLevel | null | undefined): HealthTrend | null {
  if (!previous) return null;
  const delta = HEALTH_LEVELS.indexOf(current) - HEALTH_LEVELS.indexOf(previous);
  if (delta < 0) return "improving";
  if (delta > 0) return "worsening";
  return "stable";
}

export interface OverallStatus {
  status: PlantStatus;
  label: string;
}

const TASK_STATUS_LABEL: Record<PlantStatus, string> = {
  healthy: "Soins à jour",
  watch: "À surveiller",
  today: "À faire aujourd'hui",
  attention: "Attention",
};

/**
 * Statut affiche d'une plante : combine le statut des taches
 * (computePlantStatus) et le dernier releve de sante. Une plante malade
 * passe en Attention meme sans aucune tache en retard ; a l'inverse, "En
 * bonne sante" n'est affiche que si un releve le dit reellement -- sans
 * releve, une plante sans tache urgente est seulement "Soins a jour".
 */
export function computeOverallStatus(taskStatus: PlantStatus, healthLevel: HealthLevel | null | undefined): OverallStatus {
  if (healthLevel === "CRITICAL") return { status: "attention", label: "Santé critique" };
  if (healthLevel === "POOR") return { status: "attention", label: "Mauvaise santé" };
  if (taskStatus === "attention" || taskStatus === "today") return { status: taskStatus, label: TASK_STATUS_LABEL[taskStatus] };
  if (healthLevel === "FAIR") return { status: "watch", label: "Santé moyenne" };
  if (taskStatus === "watch") return { status: "watch", label: TASK_STATUS_LABEL.watch };
  if (healthLevel === "EXCELLENT" || healthLevel === "GOOD") return { status: "healthy", label: "En bonne santé" };
  return { status: "healthy", label: TASK_STATUS_LABEL.healthy };
}
