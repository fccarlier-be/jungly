import { describe, expect, it } from "vitest";
import { computeNextDueDate, addMonths } from "@/server/careEngine/recurrence";

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

describe("addMonths", () => {
  it("31 janvier + 1 mois -> 28 fevrier (annee non bissextile)", () => {
    const result = addMonths(new Date(2026, 0, 31), 1);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(1); // fevrier
    expect(result.getDate()).toBe(28);
  });

  it("31 janvier 2028 + 1 mois -> 29 fevrier (annee bissextile)", () => {
    const result = addMonths(new Date(2028, 0, 31), 1);
    expect(result.getFullYear()).toBe(2028);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(29);
  });

  it("31 mars + 1 mois -> 30 avril", () => {
    const result = addMonths(new Date(2026, 2, 31), 1);
    expect(result.getMonth()).toBe(3); // avril
    expect(result.getDate()).toBe(30);
  });

  it("29 fevrier (bissextile) + 1 mois -> 29 mars (pas de clamp necessaire)", () => {
    const result = addMonths(new Date(2028, 1, 29), 1);
    expect(result.getMonth()).toBe(2); // mars
    expect(result.getDate()).toBe(29);
  });

  it("31 decembre + 1 mois -> 31 janvier de l'annee suivante", () => {
    const result = addMonths(new Date(2026, 11, 31), 1);
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(31);
  });

  it("29 fevrier bissextile + 12 mois -> 28 fevrier l'annee suivante (non bissextile)", () => {
    const result = addMonths(new Date(2028, 1, 29), 12);
    expect(result.getFullYear()).toBe(2029);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(28);
  });

  it("jour sans probleme de fin de mois -> inchange", () => {
    const result = addMonths(new Date(2026, 8, 15), 3);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(11); // decembre
    expect(result.getDate()).toBe(15);
  });
});
