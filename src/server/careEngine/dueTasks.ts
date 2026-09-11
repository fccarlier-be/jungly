import type { Prisma, TaskStatus } from "@generated/prisma/client";

export interface DueCheckable {
  status: TaskStatus;
  dueAt: Date;
  snoozedUntil?: Date | null;
}

/**
 * Une tâche est "due maintenant" si elle est PENDING et son échéance est
 * passée, OU si elle a été reportée (SNOOZED) et que la date de report est
 * elle-même passée. Sans ce deuxième cas, une tâche reportée ne redevient
 * jamais visible une fois `snoozedUntil` dépassé (ni sur le dashboard, ni
 * dans les notifications).
 */
export function isTaskDueNow(task: DueCheckable, asOf: Date = new Date()): boolean {
  if (task.status === "PENDING") {
    return task.dueAt.getTime() <= asOf.getTime();
  }
  if (task.status === "SNOOZED" && task.snoozedUntil) {
    return task.snoozedUntil.getTime() <= asOf.getTime();
  }
  return false;
}

/**
 * Clause Prisma équivalente à isTaskDueNow, pour filtrer directement en
 * base plutôt que de charger toutes les tâches en mémoire.
 */
export function dueTasksWhere(asOf: Date = new Date()): Prisma.TaskWhereInput {
  return {
    OR: [
      { status: "PENDING", dueAt: { lte: asOf } },
      { status: "SNOOZED", snoozedUntil: { lte: asOf } },
    ],
  };
}

/**
 * Date a laquelle une tache doit reellement etre consideree (echeance pour
 * une tache PENDING, date de report pour une tache SNOOZED). Sans ca, trier
 * ou choisir "la prochaine tache" par `dueAt` brut ignore les reports : une
 * tache reportee a demain peut se retrouver masquee derriere une autre
 * tache PENDING bien plus lointaine.
 */
export function effectiveDueDate(task: DueCheckable): Date {
  return task.status === "SNOOZED" && task.snoozedUntil ? task.snoozedUntil : task.dueAt;
}
