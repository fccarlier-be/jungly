import { describe, expect, it } from "vitest";
import { backupSchema } from "@/server/validation/backup";

function minimalBackup(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    version: 1 as const,
    locations: [],
    fertilizers: [],
    plants: [],
    ...overrides,
  };
}

describe("backupSchema -- limites structurelles", () => {
  it("accepte un backup minimal valide", () => {
    expect(backupSchema.safeParse(minimalBackup()).success).toBe(true);
  });

  it("rejette plus de 1000 plantes", () => {
    const plants = Array.from({ length: 1001 }, (_, i) => ({ name: `Plante ${i}`, careRules: [], careEvents: [], plantNotes: [], photos: [] }));
    expect(backupSchema.safeParse(minimalBackup({ plants })).success).toBe(false);
  });

  it("accepte exactement 1000 plantes", () => {
    const plants = Array.from({ length: 1000 }, (_, i) => ({ name: `Plante ${i}`, careRules: [], careEvents: [], plantNotes: [], photos: [] }));
    expect(backupSchema.safeParse(minimalBackup({ plants })).success).toBe(true);
  });

  it("rejette plus de 100 photos sur une plante", () => {
    const photos = Array.from({ length: 101 }, (_, i) => `/uploads/photo-${i}.jpg`);
    const plants = [{ name: "Test", careRules: [], careEvents: [], plantNotes: [], photos }];
    expect(backupSchema.safeParse(minimalBackup({ plants })).success).toBe(false);
  });

  it("rejette un nom de plante trop long", () => {
    const plants = [{ name: "x".repeat(201), careRules: [], careEvents: [], plantNotes: [], photos: [] }];
    expect(backupSchema.safeParse(minimalBackup({ plants })).success).toBe(false);
  });

  it("rejette une configuration de regle trop volumineuse une fois serialisee", () => {
    const plants = [
      {
        name: "Test",
        careRules: [
          {
            type: "WATERING",
            enabled: true,
            recurrenceType: "MANUAL",
            configuration: { blob: "x".repeat(10_001) },
          },
        ],
        careEvents: [],
        plantNotes: [],
        photos: [],
      },
    ];
    expect(backupSchema.safeParse(minimalBackup({ plants })).success).toBe(false);
  });

  it("accepte une configuration de regle raisonnable", () => {
    const plants = [
      {
        name: "Test",
        careRules: [{ type: "WATERING", enabled: true, recurrenceType: "FIXED_INTERVAL_DAYS", interval: 7, configuration: { waterAmount: 200 } }],
        careEvents: [],
        plantNotes: [],
        photos: [],
      },
    ];
    expect(backupSchema.safeParse(minimalBackup({ plants })).success).toBe(true);
  });

  it("rejette plus de 10000 evenements sur une plante", () => {
    const careEvents = Array.from({ length: 10_001 }, () => ({ type: "WATERING" as const, performedAt: "2026-01-01T00:00:00.000Z" }));
    const plants = [{ name: "Test", careRules: [], careEvents, plantNotes: [], photos: [] }];
    expect(backupSchema.safeParse(minimalBackup({ plants })).success).toBe(false);
  });

  function plantsWithSensors(total: number) {
    const plants: Array<Record<string, unknown>> = [];
    let remaining = total;
    while (remaining > 0) {
      // Reparti sur plusieurs plantes, jamais plus de 20/plante (MAX_SENSORS_PER_PLANT)
      // -- le plafond teste ici est le total global, pas la limite par plante.
      const count = Math.min(20, remaining);
      plants.push({
        name: `Plante ${plants.length}`,
        careRules: [],
        careEvents: [],
        plantNotes: [],
        photos: [],
        sensors: Array.from({ length: count }, (_, i) => ({ type: "SOIL_MOISTURE" as const, name: `Capteur ${plants.length}-${i}` })),
      });
      remaining -= count;
    }
    return plants;
  }

  it("rejette plus de 100 capteurs au total, repartis sur plusieurs plantes", () => {
    expect(backupSchema.safeParse(minimalBackup({ plants: plantsWithSensors(101) })).success).toBe(false);
  });

  it("accepte exactement 100 capteurs au total", () => {
    expect(backupSchema.safeParse(minimalBackup({ plants: plantsWithSensors(100) })).success).toBe(true);
  });
});
