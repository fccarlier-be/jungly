import { describe, expect, it } from "vitest";
import { computeWateringMultiplier } from "@/server/weather/multiplier";

describe("computeWateringMultiplier", () => {
  it("tableau vide -> aucun ajustement", () => {
    expect(computeWateringMultiplier([])).toBe(1);
  });

  it("temperatures fraiches (< 15°C) -> arrosages espaces", () => {
    expect(computeWateringMultiplier([10, 12, 8])).toBe(1.3);
  });

  it("temperatures normales (15-25°C) -> aucun ajustement", () => {
    expect(computeWateringMultiplier([18, 20, 22])).toBe(1);
  });

  it("chaleur (25-30°C) -> arrosages un peu plus frequents", () => {
    expect(computeWateringMultiplier([26, 28, 27])).toBe(0.85);
  });

  it("canicule (> 30°C) -> arrosages nettement plus frequents", () => {
    expect(computeWateringMultiplier([32, 34, 33])).toBe(0.7);
  });

  it("se base sur la moyenne, pas sur un seul jour", () => {
    // Un seul jour a 35°C au milieu de jours frais ne doit pas a lui seul declencher le mode canicule.
    expect(computeWateringMultiplier([12, 35, 13])).toBe(1);
  });
});
