import { normalizeForSearch } from "@/lib/textSearch";
import type { PlantnetCandidate } from "@/server/plantnet/client";

export interface LibraryEntryForMatch {
  id: string;
  commonName: string;
  scientificName: string | null;
  [key: string]: unknown;
}

export interface IdentifiedCandidate {
  scientificName: string;
  commonNames: string[];
  score: number;
  libraryEntry: LibraryEntryForMatch | null;
}

/**
 * Associe chaque candidat Pl@ntNet a une fiche de bibliotheque existante,
 * par nom scientifique (comparaison insensible a la casse et aux accents,
 * meme logique que la recherche de bibliotheque -- voir textSearch.ts).
 * Correspondance exacte uniquement : un nom scientifique approchant mais
 * different (ex. genre seul) resterait une fausse suggestion de profil de
 * soin.
 */
export function matchLibraryEntries(candidates: PlantnetCandidate[], libraryEntries: LibraryEntryForMatch[]): IdentifiedCandidate[] {
  return candidates.map((candidate) => {
    const normalizedCandidate = normalizeForSearch(candidate.scientificName);
    const libraryEntry =
      libraryEntries.find((entry) => entry.scientificName && normalizeForSearch(entry.scientificName) === normalizedCandidate) ?? null;
    return { ...candidate, libraryEntry };
  });
}
