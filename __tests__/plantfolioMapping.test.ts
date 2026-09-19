import { describe, expect, it } from "vitest";
import { mapPlantfolioEntry, extractScientificName, type PlantfolioRawEntry } from "../prisma/plantfolioMapping";

function raw(overrides: Partial<PlantfolioRawEntry> & Pick<PlantfolioRawEntry, "id" | "typeName">): PlantfolioRawEntry {
  return overrides;
}

/**
 * Retour utilisateur (2026-09-19) : "pas d'orchidees dans la bibliotheque"
 * -- en realite si, mais sous des noms anglais (plantfolio n'a pas de
 * version francaise).
 */
describe("mapPlantfolioEntry -- noms francais", () => {
  it("remplace le nom anglais par le nom francais etabli pour les entrees corrigees", () => {
    const entry = mapPlantfolioEntry(raw({ id: "paphiopedilum", typeName: "Slipper Orchid" }));
    expect(entry.commonName).toBe("Sabot de Vénus");
  });

  it("laisse typeName inchange pour une entree sans correction connue", () => {
    const entry = mapPlantfolioEntry(raw({ id: "abelia", typeName: "Abelia" }));
    expect(entry.commonName).toBe("Abelia");
  });

  it("corrige les cinq entrees de la famille des orchidees actuellement importees", () => {
    const ids = ["epiphyllum", "dendrobium-orchid", "oncidium-orchid", "paphiopedilum", "vanda-orchid"];
    for (const id of ids) {
      const entry = mapPlantfolioEntry(raw({ id, typeName: "PLACEHOLDER_ANGLAIS" }));
      expect(entry.commonName).not.toBe("PLACEHOLDER_ANGLAIS");
    }
  });
});

describe("extractScientificName", () => {
  it("extrait un binome latin depuis commonExamples", () => {
    expect(extractScientificName("Dendrobium spp. (Singapore orchid)")).toBe("Dendrobium");
  });
});
