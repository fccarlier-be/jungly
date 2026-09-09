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
 */
export function computeRuleNextDueDate(rule: CareRuleLike, fromDate: Date): Date | null {
  if (!shouldGenerateTask(rule)) {
    return null;
  }

  const config = rule.configuration ?? {};
  const due = computeNextDueDate(
    { recurrenceType: rule.recurrenceType, interval: rule.interval, exactDate: config.exactDate },
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
