import { describe, expect, it } from "vitest";
import { computeNextDueDate } from "@/server/careEngine/recurrence";

describe("computeNextDueDate", () => {
  it("arrosage tous les 7 jours", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const next = computeNextDueDate({ recurrenceType: "FIXED_INTERVAL_DAYS", interval: 7 }, from);
    expect(next?.toISOString().slice(0, 10)).toBe("2026-09-08");
  });

  it("fertilisation tous les 30 jours", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const next = computeNextDueDate({ recurrenceType: "FIXED_INTERVAL_DAYS", interval: 30 }, from);
    expect(next?.toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("intervalle en semaines", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const next = computeNextDueDate({ recurrenceType: "INTERVAL_WEEKS", interval: 2 }, from);
    expect(next?.toISOString().slice(0, 10)).toBe("2026-09-15");
  });

  it("intervalle en mois", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const next = computeNextDueDate({ recurrenceType: "INTERVAL_MONTHS", interval: 3 }, from);
    expect(next?.toISOString().slice(0, 10)).toBe("2026-12-01");
  });

  it("recurrence annuelle", () => {
    const from = new Date("2026-04-12T00:00:00Z");
    const next = computeNextDueDate({ recurrenceType: "YEARLY", interval: null }, from);
    expect(next?.toISOString().slice(0, 10)).toBe("2027-04-12");
  });

  it("date precise (EXACT_DATE)", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const next = computeNextDueDate(
      { recurrenceType: "EXACT_DATE", interval: null, exactDate: "2026-12-25" },
      from,
    );
    expect(next?.toISOString().slice(0, 10)).toBe("2026-12-25");
  });

  it("EXACT_DATE sans date leve une erreur explicite", () => {
    expect(() =>
      computeNextDueDate({ recurrenceType: "EXACT_DATE", interval: null }, new Date()),
    ).toThrow();
  });

  it("changement de frequence : un intervalle plus court rapproche l'echeance", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const short = computeNextDueDate({ recurrenceType: "FIXED_INTERVAL_DAYS", interval: 3 }, from);
    const long = computeNextDueDate({ recurrenceType: "FIXED_INTERVAL_DAYS", interval: 14 }, from);
    expect(short!.getTime()).toBeLessThan(long!.getTime());
  });

  it("MANUAL et MOISTURE_THRESHOLD ne calculent pas d'echeance", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    expect(computeNextDueDate({ recurrenceType: "MANUAL", interval: null }, from)).toBeNull();
    expect(computeNextDueDate({ recurrenceType: "MOISTURE_THRESHOLD", interval: null }, from)).toBeNull();
  });

  it("intervalle invalide (<=0) leve une erreur", () => {
    expect(() =>
      computeNextDueDate({ recurrenceType: "FIXED_INTERVAL_DAYS", interval: 0 }, new Date()),
    ).toThrow();
  });
});
