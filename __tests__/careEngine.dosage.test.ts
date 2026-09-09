import { describe, expect, it } from "vitest";
import { computeFertilizerAmount } from "@/server/careEngine/dosage";

describe("computeFertilizerAmount", () => {
  it("calcule 2ml/L pour 1.5L -> 3ml", () => {
    expect(computeFertilizerAmount(2, 1.5)).toBe(3);
  });

  it("arrondit a 1 decimale", () => {
    expect(computeFertilizerAmount(1.1, 1.3)).toBeCloseTo(1.4, 5);
  });

  it("rejette un dosage <= 0", () => {
    expect(() => computeFertilizerAmount(0, 1)).toThrow();
    expect(() => computeFertilizerAmount(-1, 1)).toThrow();
  });

  it("rejette un volume <= 0", () => {
    expect(() => computeFertilizerAmount(2, 0)).toThrow();
    expect(() => computeFertilizerAmount(2, -1)).toThrow();
  });
});
