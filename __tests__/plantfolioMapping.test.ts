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

  it("laisse typeName inchange pour une entree sans correction connue (genre deja utilise tel quel en francais)", () => {
    const entry = mapPlantfolioEntry(raw({ id: "hoya-australis", typeName: "Hoya Australis" }));
    expect(entry.commonName).toBe("Hoya Australis");
  });

  it("corrige les cinq entrees de la famille des orchidees actuellement importees", () => {
    const ids = ["epiphyllum", "dendrobium-orchid", "oncidium-orchid", "paphiopedilum", "vanda-orchid"];
    for (const id of ids) {
      const entry = mapPlantfolioEntry(raw({ id, typeName: "PLACEHOLDER_ANGLAIS" }));
      expect(entry.commonName).not.toBe("PLACEHOLDER_ANGLAIS");
    }
  });

  /**
   * Demande explicite (2026-09-19) : traduction quasi complete des 663
   * fiches importees, pas seulement les orchidees. Verifie un echantillon
   * plutot que les ~590 entrees une par une (deja fait manuellement a la
   * redaction de la table).
   */
  it("traduit un echantillon representatif de plantes tres courantes", () => {
    const samples: Record<string, string> = {
      begonia: "Bégonia",
      hydrangeas: "Hortensias",
      "japanese-maple": "Érable du Japon",
      lavender: "Lavande",
      "lily-of-the-valley": "Muguet",
      wisteria: "Glycine",
    };
    for (const [id, expected] of Object.entries(samples)) {
      const entry = mapPlantfolioEntry(raw({ id, typeName: "PLACEHOLDER_ANGLAIS" }));
      expect(entry.commonName).toBe(expected);
    }
  });
});

describe("extractScientificName", () => {
  it("extrait un binome latin depuis commonExamples", () => {
    expect(extractScientificName("Dendrobium spp. (Singapore orchid)")).toBe("Dendrobium");
  });
});
