import { describe, expect, it } from "vitest";
import {
  computeRuleNextDueDate,
  isOverdue,
  markCompleted,
  shouldGenerateTask,
  snoozeTask,
  type CareRuleLike,
  type TaskLike,
} from "@/server/careEngine/taskGenerator";

const wateringRule: CareRuleLike = {
  enabled: true,
  type: "WATERING",
  recurrenceType: "FIXED_INTERVAL_DAYS",
  interval: 7,
};

describe("shouldGenerateTask", () => {
  it("une regle desactivee ne genere jamais de tache", () => {
    expect(shouldGenerateTask({ ...wateringRule, enabled: false })).toBe(false);
    expect(shouldGenerateTask(wateringRule)).toBe(true);
  });
});

describe("computeRuleNextDueDate", () => {
  const from = new Date("2026-09-01T00:00:00Z");

  it("regle desactivee -> pas d'echeance", () => {
    expect(computeRuleNextDueDate({ ...wateringRule, enabled: false }, from)).toBeNull();
  });

  it("regle active, intervalle fixe -> echeance calculee", () => {
    const due = computeRuleNextDueDate(wateringRule, from);
    expect(due?.toISOString().slice(0, 10)).toBe("2026-09-08");
  });

  it("changement de frequence -> echeance recalculee", () => {
    const due14 = computeRuleNextDueDate({ ...wateringRule, interval: 14 }, from);
    expect(due14?.toISOString().slice(0, 10)).toBe("2026-09-15");
  });

  it("changement de date (EXACT_DATE) -> echeance = la date fournie", () => {
    const rule: CareRuleLike = {
      enabled: true,
      type: "REPOTTING",
      recurrenceType: "EXACT_DATE",
      interval: null,
      configuration: { exactDate: "2027-03-01" },
    };
    const due = computeRuleNextDueDate(rule, from);
    expect(due?.toISOString().slice(0, 10)).toBe("2027-03-01");
  });

  it("regle saisonniere : hors saison, l'echeance est repoussee au prochain mois actif", () => {
    // fertilisation active mars -> septembre uniquement, tous les 30 jours.
    const rule: CareRuleLike = {
      enabled: true,
      type: "FERTILIZING",
      recurrenceType: "FIXED_INTERVAL_DAYS",
      interval: 30,
      configuration: { activeFromMonth: 3, activeUntilMonth: 9 },
    };
    // depuis le 15 octobre : +30 jours tombe le 14 novembre, hors saison -> repousse a mars.
    const fromOctober = new Date("2026-10-15T00:00:00Z");
    const due = computeRuleNextDueDate(rule, fromOctober);
    expect(due?.getMonth()).toBe(2); // mars
  });

  it("regle saisonniere : en saison, l'echeance n'est pas modifiee", () => {
    const rule: CareRuleLike = {
      enabled: true,
      type: "FERTILIZING",
      recurrenceType: "FIXED_INTERVAL_DAYS",
      interval: 14,
      configuration: { activeFromMonth: 3, activeUntilMonth: 9 },
    };
    const fromJune = new Date("2026-06-01T00:00:00Z");
    const due = computeRuleNextDueDate(rule, fromJune);
    expect(due?.toISOString().slice(0, 10)).toBe("2026-06-15");
  });
});

describe("transitions d'etat d'une tache", () => {
  const pendingTask: TaskLike = { status: "PENDING", dueAt: new Date("2026-09-01T00:00:00Z") };

  it("tache completee", () => {
    const completedAt = new Date("2026-09-02T00:00:00Z");
    const result = markCompleted(pendingTask, completedAt);
    expect(result.status).toBe("COMPLETED");
    expect(result.completedAt).toEqual(completedAt);
  });

  it("tache reportee ne modifie que le statut/snoozedUntil (pas la regle)", () => {
    const until = new Date("2026-09-05T00:00:00Z");
    const result = snoozeTask(pendingTask, until);
    expect(result.status).toBe("SNOOZED");
    expect(result.snoozedUntil).toEqual(until);
    expect(result.dueAt).toEqual(pendingTask.dueAt);
  });

  it("tache en retard", () => {
    const now = new Date("2026-09-10T00:00:00Z");
    expect(isOverdue(pendingTask, now)).toBe(true);
    expect(isOverdue({ ...pendingTask, dueAt: new Date("2026-09-20T00:00:00Z") }, now)).toBe(false);
    expect(isOverdue({ ...pendingTask, status: "COMPLETED" }, now)).toBe(false);
  });
});
