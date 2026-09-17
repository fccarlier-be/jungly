import { describe, expect, it } from "vitest";
import {
  normalizeWateringIntervalDays,
  checkContainerCompatibility,
  type CompatibilityPlant,
} from "@/lib/containerCompatibility";

/**
 * Retour beta (2026-09-17) : "je peux mettre de l'origan avec un pothos
 * avec un begonia". Ces fonctions ne bloquent jamais -- seulement des
 * avertissements en langage clair.
 */
describe("normalizeWateringIntervalDays", () => {
  it("convertit FIXED_INTERVAL_DAYS tel quel", () => {
    expect(normalizeWateringIntervalDays({ enabled: true, recurrenceType: "FIXED_INTERVAL_DAYS", interval: 7 })).toBe(7);
  });

  it("convertit INTERVAL_WEEKS en jours", () => {
    expect(normalizeWateringIntervalDays({ enabled: true, recurrenceType: "INTERVAL_WEEKS", interval: 3 })).toBe(21);
  });

  it("convertit INTERVAL_MONTHS en jours", () => {
    expect(normalizeWateringIntervalDays({ enabled: true, recurrenceType: "INTERVAL_MONTHS", interval: 1 })).toBe(30);
  });

  it("renvoie null pour un type sans intervalle fixe comparable", () => {
    expect(normalizeWateringIntervalDays({ enabled: true, recurrenceType: "MANUAL", interval: null })).toBeNull();
    expect(normalizeWateringIntervalDays({ enabled: true, recurrenceType: "MOISTURE_THRESHOLD", interval: null })).toBeNull();
    expect(normalizeWateringIntervalDays({ enabled: true, recurrenceType: "EXACT_DATE", interval: null })).toBeNull();
  });

  it("renvoie null pour une regle desactivee", () => {
    expect(normalizeWateringIntervalDays({ enabled: false, recurrenceType: "FIXED_INTERVAL_DAYS", interval: 7 })).toBeNull();
  });

  it("renvoie null en l'absence de regle", () => {
    expect(normalizeWateringIntervalDays(null)).toBeNull();
    expect(normalizeWateringIntervalDays(undefined)).toBeNull();
  });
});

function plant(overrides: Partial<CompatibilityPlant> & Pick<CompatibilityPlant, "id" | "name">): CompatibilityPlant {
  return { substrateType: null, wateringIntervalDays: null, ...overrides };
}

describe("checkContainerCompatibility", () => {
  it("ne remonte rien pour des besoins en eau proches", () => {
    const warnings = checkContainerCompatibility([
      plant({ id: "a", name: "Pothos", wateringIntervalDays: 7 }),
      plant({ id: "b", name: "Fougère", wateringIntervalDays: 9 }),
    ]);
    expect(warnings).toEqual([]);
  });

  it("avertit sur un ecart d'arrosage important (exemple origan/begonia)", () => {
    const warnings = checkContainerCompatibility([
      plant({ id: "a", name: "Origan", wateringIntervalDays: 21 }),
      plant({ id: "b", name: "Bégonia", wateringIntervalDays: 4 }),
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe("watering");
    expect(warnings[0].message).toContain("Bégonia");
    expect(warnings[0].message).toContain("Origan");
  });

  it("n'avertit pas juste sous le seuil (x1.5)", () => {
    const warnings = checkContainerCompatibility([
      plant({ id: "a", name: "A", wateringIntervalDays: 10 }),
      plant({ id: "b", name: "B", wateringIntervalDays: 14 }),
    ]);
    expect(warnings.filter((w) => w.kind === "watering")).toEqual([]);
  });

  it("ignore les plantes sans intervalle comparable dans le calcul d'arrosage", () => {
    const warnings = checkContainerCompatibility([
      plant({ id: "a", name: "Manuelle", wateringIntervalDays: null }),
      plant({ id: "b", name: "Seule-avec-intervalle", wateringIntervalDays: 7 }),
    ]);
    expect(warnings.filter((w) => w.kind === "watering")).toEqual([]);
  });

  it("avertit sur des substrats differents renseignes", () => {
    const warnings = checkContainerCompatibility([
      plant({ id: "a", name: "Cactus", substrateType: "DRAINING" }),
      plant({ id: "b", name: "Fougère", substrateType: "MOISTURE_RETAINING" }),
    ]);
    expect(warnings.some((w) => w.kind === "substrate")).toBe(true);
  });

  it("ne compare pas le substrat quand il n'est pas renseigne (silencieux, pas de fausse certitude)", () => {
    const warnings = checkContainerCompatibility([
      plant({ id: "a", name: "Cactus", substrateType: "DRAINING" }),
      plant({ id: "b", name: "Fougère", substrateType: null }),
    ]);
    expect(warnings.filter((w) => w.kind === "substrate")).toEqual([]);
  });

  it("peut remonter les deux types d'avertissement a la fois", () => {
    const warnings = checkContainerCompatibility([
      plant({ id: "a", name: "Origan", wateringIntervalDays: 21, substrateType: "DRAINING" }),
      plant({ id: "b", name: "Bégonia", wateringIntervalDays: 4, substrateType: "MOISTURE_RETAINING" }),
    ]);
    expect(warnings.map((w) => w.kind).sort()).toEqual(["substrate", "watering"]);
  });
});
