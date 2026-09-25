import { describe, expect, it } from "vitest";
import { computeHealthTrend, computeOverallStatus, isSick } from "@/lib/plantHealth";
import { genericEventSchema } from "@/server/validation/careEvent";

describe("computeOverallStatus (taches + sante)", () => {
  it("n'affiche 'En bonne santé' que si un releve le dit", () => {
    expect(computeOverallStatus("healthy", null)).toEqual({ status: "healthy", label: "Soins à jour" });
    expect(computeOverallStatus("healthy", "GOOD")).toEqual({ status: "healthy", label: "En bonne santé" });
    expect(computeOverallStatus("healthy", "EXCELLENT").label).toBe("En bonne santé");
  });

  it("une plante malade passe en Attention meme sans tache en retard", () => {
    expect(computeOverallStatus("healthy", "POOR")).toEqual({ status: "attention", label: "Mauvaise santé" });
    expect(computeOverallStatus("today", "CRITICAL")).toEqual({ status: "attention", label: "Santé critique" });
  });

  it("une sante moyenne met au moins en surveillance, sans masquer une tache due", () => {
    expect(computeOverallStatus("healthy", "FAIR")).toEqual({ status: "watch", label: "Santé moyenne" });
    expect(computeOverallStatus("today", "FAIR").status).toBe("today");
    expect(computeOverallStatus("attention", "GOOD").status).toBe("attention");
  });
});

describe("computeHealthTrend", () => {
  it("compare au releve precedent", () => {
    expect(computeHealthTrend("GOOD", null)).toBeNull();
    expect(computeHealthTrend("GOOD", "POOR")).toBe("improving");
    expect(computeHealthTrend("CRITICAL", "FAIR")).toBe("worsening");
    expect(computeHealthTrend("FAIR", "FAIR")).toBe("stable");
  });
});

describe("isSick", () => {
  it("seuls Mauvaise et Critique comptent comme malade", () => {
    expect(isSick("POOR")).toBe(true);
    expect(isSick("CRITICAL")).toBe(true);
    expect(isSick("FAIR")).toBe(false);
    expect(isSick(null)).toBe(false);
  });
});

describe("genericEventSchema (releve de sante)", () => {
  it("accepte un releve sur une inspection", () => {
    const input = genericEventSchema.parse({ type: "INSPECTION", healthLevel: "POOR", symptoms: ["PESTS"] });
    expect(input.healthLevel).toBe("POOR");
  });

  it("refuse un releve sur un autre type d'evenement", () => {
    expect(() => genericEventSchema.parse({ type: "PRUNING", healthLevel: "GOOD" })).toThrow();
  });

  it("refuse un niveau ou un symptome inconnu", () => {
    expect(() => genericEventSchema.parse({ type: "INSPECTION", healthLevel: "DEAD" })).toThrow();
    expect(() => genericEventSchema.parse({ type: "INSPECTION", symptoms: ["NOPE"] })).toThrow();
  });
});
