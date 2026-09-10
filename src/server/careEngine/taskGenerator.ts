import type { CareRuleType, TaskType } from "@prisma/client";
import { computeNextDueDate, type RecurrenceRule } from "./recurrence";
import { isMonthActive, pushToNextActiveWindow, type SeasonalWindow } from "./seasonal";

export interface RuleConfiguration extends SeasonalWindow {
  exactDate?: string | null;
  waterAmount?: number;
  waterUnit?: string;
  fertilizerId?: string;
  dosagePerLiter?: number;
  dilutionVolumeLiters?: number;
  // Utilise par sensorTrigger.ts (regle MOISTURE_THRESHOLD) -- absent
  // jusqu'ici de cette interface bien que deja lu au runtime.
  moistureThresholdPercent?: number;
}

export interface CareRuleLike {
  enabled: boolean;
  type: CareRuleType;
  recurrenceType: RecurrenceRule["recurrenceType"];
  interval: number | null;
  configuration?: RuleConfiguration | null;
}

const RULE_TYPE_TO_TASK_TYPE: Record<CareRuleType, TaskType> = {
  WATERING: "WATERING",
  FERTILIZING: "FERTILIZING",
  REPOTTING: "REPOTTING",
};

const RULE_TYPE_LABEL: Record<CareRuleType, string> = {
  WATERING: "Arrosage",
  FERTILIZING: "Fertilisation",
  REPOTTING: "Rempotage",
};

export function mapRuleTypeToTaskType(type: CareRuleType): TaskType {
  return RULE_TYPE_TO_TASK_TYPE[type];
}

export function buildTaskTitle(type: CareRuleType, plantName: string): string {
  return `${RULE_TYPE_LABEL[type]} - ${plantName}`;
}

/** Une règle désactivée ne doit jamais générer de tâche. */
export function shouldGenerateTask(rule: CareRuleLike): boolean {
  return rule.enabled;
}

/**
 * Calcule la prochaine échéance d'une règle, en tenant compte de la
 * récurrence ET de la fenêtre saisonnière éventuelle. Renvoie null si la
 * règle est désactivée, manuelle, ou pilotée par capteur (MOISTURE_THRESHOLD).
 *
 * `wateringIntervalMultiplier` (defaut 1) n'est applique qu'aux règles
 * d'arrosage avec un intervalle exprimé en jours/semaines/mois -- ni a
 * EXACT_DATE (date fixe, pas un intervalle a ajuster), ni aux autres types
 * de soin (voir src/server/weather/).
 */
export function computeRuleNextDueDate(rule: CareRuleLike, fromDate: Date, wateringIntervalMultiplier = 1): Date | null {
  if (!shouldGenerateTask(rule)) {
    return null;
  }

  const config = rule.configuration ?? {};
  const scalableRecurrence =
    rule.recurrenceType === "FIXED_INTERVAL_DAYS" ||
    rule.recurrenceType === "INTERVAL_WEEKS" ||
    rule.recurrenceType === "INTERVAL_MONTHS";
  const effectiveInterval =
    rule.type === "WATERING" && scalableRecurrence && rule.interval != null && wateringIntervalMultiplier !== 1
      ? Math.max(1, Math.round(rule.interval * wateringIntervalMultiplier))
      : rule.interval;

  const due = computeNextDueDate(
    { recurrenceType: rule.recurrenceType, interval: effectiveInterval, exactDate: config.exactDate },
    fromDate,
  );
  if (due == null) {
    return null;
  }

  if (config.activeFromMonth != null && config.activeUntilMonth != null) {
    return pushToNextActiveWindow(due, config);
  }
  return due;
}

export function isRuleActiveForMonth(rule: CareRuleLike, month: number): boolean {
  const config = rule.configuration ?? {};
  return isMonthActive(config, month);
}

// ---------------------------------------------------------------------------
// Transitions d'état pures sur une tâche (pas d'accès DB ici)
// ---------------------------------------------------------------------------

export interface TaskLike {
  status: "PENDING" | "COMPLETED" | "SNOOZED" | "SKIPPED";
  dueAt: Date;
  completedAt?: Date | null;
  snoozedUntil?: Date | null;
}

export function markCompleted<T extends TaskLike>(task: T, completedAt: Date = new Date()): T {
  return { ...task, status: "COMPLETED", completedAt };
}

/**
 * Reporte une tâche. Ne modifie jamais la règle de récurrence associée :
 * seule la tâche change.
 */
export function snoozeTask<T extends TaskLike>(task: T, until: Date): T {
  return { ...task, status: "SNOOZED", snoozedUntil: until };
}

export function isOverdue(task: TaskLike, now: Date = new Date()): boolean {
  return task.status === "PENDING" && task.dueAt.getTime() < now.getTime();
}
