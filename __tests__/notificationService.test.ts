import { describe, expect, it } from "vitest";
import { buildDailyDigestMessage } from "@/server/notifications/notificationService";

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
