import { describe, expect, it } from "vitest";
import { matchLibraryEntries, type LibraryEntryForMatch } from "../src/server/plantnet/matching";
import type { PlantnetCandidate } from "../src/server/plantnet/client";

function candidate(overrides: Partial<PlantnetCandidate> & Pick<PlantnetCandidate, "scientificName">): PlantnetCandidate {
  return { commonNames: [], score: 0.5, ...overrides };
}

function entry(overrides: Partial<LibraryEntryForMatch> & Pick<LibraryEntryForMatch, "id" | "commonName">): LibraryEntryForMatch {
  return { scientificName: null, ...overrides };
}

/**
 * Retour utilisateur (2026-09-20) : test manuel Pl@ntNet sur 4 vraies photos
 * Jungly, 3/4 identifications exactes -- matchLibraryEntries relie ensuite
 * le nom scientifique renvoye par Pl@ntNet a une fiche de bibliotheque
 * existante, pour proposer directement son profil de soin.
 */
describe("matchLibraryEntries", () => {
  it("associe un candidat a la fiche de bibliotheque au nom scientifique identique", () => {
    const entries = [entry({ id: "1", commonName: "Pilea", scientificName: "Pilea peperomioides" })];
    const [result] = matchLibraryEntries([candidate({ scientificName: "Pilea peperomioides" })], entries);
    expect(result!.libraryEntry?.id).toBe("1");
  });

  it("ignore les accents et la casse dans la comparaison", () => {
    const entries = [entry({ id: "1", commonName: "Érable du Japon", scientificName: "Acer palmatum" })];
    const [result] = matchLibraryEntries([candidate({ scientificName: "acer PALMATUM" })], entries);
    expect(result!.libraryEntry?.id).toBe("1");
  });

  it("ne fait pas correspondre un nom de genre seul a une espece precise", () => {
    const entries = [entry({ id: "1", commonName: "Hoya Australis", scientificName: "Hoya australis" })];
    const [result] = matchLibraryEntries([candidate({ scientificName: "Hoya carnosa" })], entries);
    expect(result!.libraryEntry).toBeNull();
  });

  it("renvoie null quand aucune fiche ne correspond", () => {
    const [result] = matchLibraryEntries([candidate({ scientificName: "Species inconnue" })], []);
    expect(result!.libraryEntry).toBeNull();
  });

  it("conserve les champs du candidat original (score, noms communs)", () => {
    const [result] = matchLibraryEntries([candidate({ scientificName: "X", score: 0.87, commonNames: ["Truc"] })], []);
    expect(result).toMatchObject({ scientificName: "X", score: 0.87, commonNames: ["Truc"] });
  });
});
