import { describe, expect, it } from "vitest";
import { createPlantSchema } from "@/server/validation/plant";
import { repotEventSchema } from "@/server/validation/careEvent";

const BASE = { name: "Monstera" };

/**
 * Retour beta (2026-09-17) : une jardiniere/pot rectangulaire n'a pas de
 * diametre -- potShape distingue desormais les deux, et les dimensions de
 * l'AUTRE forme doivent pouvoir etre effacees explicitement (null) au
 * changement de forme, voir PlantForm.tsx.
 */
describe("createPlantSchema -- forme du pot", () => {
  it("accepte un pot rond avec un diametre", () => {
    const r = createPlantSchema.safeParse({ ...BASE, potShape: "ROUND", potDiameterMm: 200 });
    expect(r.success).toBe(true);
  });

  it("accepte un pot rectangulaire avec longueur/largeur", () => {
    const r = createPlantSchema.safeParse({ ...BASE, potShape: "RECTANGULAR", potLengthMm: 600, potWidthMm: 200 });
    expect(r.success).toBe(true);
  });

  it("accepte null sur potDiameterMm/potLengthMm/potWidthMm (effacement au changement de forme)", () => {
    const r = createPlantSchema.safeParse({ ...BASE, potShape: "RECTANGULAR", potDiameterMm: null, potLengthMm: 600, potWidthMm: 200 });
    expect(r.success).toBe(true);
  });

  it("rejette une forme de pot inconnue", () => {
    const r = createPlantSchema.safeParse({ ...BASE, potShape: "OVAL" });
    expect(r.success).toBe(false);
  });

  it("potShape reste optionnel (retro-compatibilite, defaut ROUND cote schema Prisma)", () => {
    const r = createPlantSchema.safeParse({ ...BASE, potDiameterMm: 150 });
    expect(r.success).toBe(true);
  });
});

describe("repotEventSchema -- forme du pot", () => {
  it("accepte un nouveau pot rectangulaire", () => {
    const r = repotEventSchema.safeParse({ newPotShape: "RECTANGULAR", newPotLengthMm: 500, newPotWidthMm: 180 });
    expect(r.success).toBe(true);
  });

  it("accepte null sur newPotDiameterMm en passant a une jardiniere", () => {
    const r = repotEventSchema.safeParse({ newPotShape: "RECTANGULAR", newPotDiameterMm: null, newPotLengthMm: 500, newPotWidthMm: 180 });
    expect(r.success).toBe(true);
  });
});
