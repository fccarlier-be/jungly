import { describe, expect, it } from "vitest";
import { normalizeForSearch } from "@/lib/textSearch";

/**
 * Retour utilisateur (2026-09-19) : chercher "orchidee" (sans accent) dans
 * la bibliotheque ne remontait pas "Orchidée papillon", pourtant bien
 * presente.
 */
describe("normalizeForSearch", () => {
  it("retire les accents", () => {
    expect(normalizeForSearch("Orchidée")).toBe("orchidee");
  });

  it("met en minuscules", () => {
    expect(normalizeForSearch("MONSTERA")).toBe("monstera");
  });

  it("permet de faire correspondre une recherche sans accent a un nom accentue", () => {
    expect(normalizeForSearch("Orchidée papillon").includes(normalizeForSearch("orchidee"))).toBe(true);
  });

  it("gere plusieurs accents et cedilles", () => {
    expect(normalizeForSearch("Ficus élastica")).toBe("ficus elastica");
    expect(normalizeForSearch("Façade")).toBe("facade");
  });
});
