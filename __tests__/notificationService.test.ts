import { describe, expect, it } from "vitest";
import { buildDailyDigestMessage, splitOverdueAndDueToday } from "@/server/notifications/notificationService";

describe("buildDailyDigestMessage", () => {
  it("aucune tâche due ni à venir -> pas de notification", () => {
    expect(buildDailyDigestMessage({ dueTodayCount: 0, overdueCount: 0, upcomingCount: 0, advanceReminderDays: 3 })).toBeNull();
  });

  it("une tâche due aujourd'hui", () => {
    const message = buildDailyDigestMessage({ dueTodayCount: 1, overdueCount: 0, upcomingCount: 0, advanceReminderDays: 0 });
    expect(message?.title).toBe("💧 Jungly");
    expect(message?.body).toContain("1 tâche vous attend aujourd'hui");
  });

  it("plusieurs tâches dues aujourd'hui", () => {
    const message = buildDailyDigestMessage({ dueTodayCount: 3, overdueCount: 0, upcomingCount: 0, advanceReminderDays: 0 });
    expect(message?.body).toContain("3 tâches vous attendent aujourd'hui");
  });

  it("tâches en retard -> titre avec avertissement et mention du compte", () => {
    const message = buildDailyDigestMessage({ dueTodayCount: 2, overdueCount: 1, upcomingCount: 0, advanceReminderDays: 0 });
    expect(message?.title).toBe("⚠️ Jungly");
    expect(message?.body).toContain("3 tâches vous attendent aujourd'hui");
    expect(message?.body).toContain("dont 1 en retard");
  });

  it("rien aujourd'hui mais des échéances à venir sous le délai de rappel anticipé", () => {
    const message = buildDailyDigestMessage({ dueTodayCount: 0, overdueCount: 0, upcomingCount: 2, advanceReminderDays: 3 });
    expect(message?.body).toContain("2 tâches à venir sous 3 jours");
  });

  it("tâches aujourd'hui ET à venir : les deux sont mentionnées", () => {
    const message = buildDailyDigestMessage({ dueTodayCount: 1, overdueCount: 0, upcomingCount: 1, advanceReminderDays: 2 });
    expect(message?.body).toContain("aujourd'hui");
    expect(message?.body).toContain("à venir sous 2 jours");
  });
});

describe("splitOverdueAndDueToday", () => {
  const startOfToday = new Date("2026-09-10T00:00:00.000Z");

  it("une tache PENDING en retard compte comme en retard", () => {
    const result = splitOverdueAndDueToday(
      [{ status: "PENDING", dueAt: new Date("2026-09-05T00:00:00.000Z") }],
      startOfToday,
    );
    expect(result).toEqual({ overdueCount: 1, dueTodayCount: 0 });
  });

  it("une tache PENDING due aujourd'hui ne compte pas comme en retard", () => {
    const result = splitOverdueAndDueToday(
      [{ status: "PENDING", dueAt: new Date("2026-09-10T10:00:00.000Z") }],
      startOfToday,
    );
    expect(result).toEqual({ overdueCount: 0, dueTodayCount: 1 });
  });

  it("une tache SNOOZED avec un vieux dueAt mais reportee a aujourd'hui n'est PAS en retard", () => {
    // Cas du bug corrige : dueAt d'origine tres ancien, mais snoozedUntil = aujourd'hui.
    const result = splitOverdueAndDueToday(
      [{ status: "SNOOZED", dueAt: new Date("2026-08-01T00:00:00.000Z"), snoozedUntil: new Date("2026-09-10T08:00:00.000Z") }],
      startOfToday,
    );
    expect(result).toEqual({ overdueCount: 0, dueTodayCount: 1 });
  });

  it("une tache SNOOZED dont le report est lui-meme deja passe reste en retard", () => {
    const result = splitOverdueAndDueToday(
      [{ status: "SNOOZED", dueAt: new Date("2026-09-08T00:00:00.000Z"), snoozedUntil: new Date("2026-09-09T00:00:00.000Z") }],
      startOfToday,
    );
    expect(result).toEqual({ overdueCount: 1, dueTodayCount: 0 });
  });
});
