export type PlantStatus = "healthy" | "watch" | "today" | "attention";

export const STATUS_LABEL: Record<PlantStatus, string> = {
  healthy: "En bonne santé",
  watch: "À surveiller",
  today: "À faire aujourd'hui",
  attention: "Attention",
};

/** Calcule le statut visuel d'une plante a partir de sa prochaine tache en attente. */
export function computePlantStatus(nextTaskDueAt: Date | string | null | undefined): PlantStatus {
  if (!nextTaskDueAt) return "healthy";

  const due = new Date(nextTaskDueAt);
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  if (due < startOfToday) return "attention";
  if (due <= endOfToday) return "today";

  const watchUntil = new Date(endOfToday);
  watchUntil.setDate(watchUntil.getDate() + 2);
  if (due <= watchUntil) return "watch";

  return "healthy";
}
