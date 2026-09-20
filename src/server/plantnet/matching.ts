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
  // Retour utilisateur (2026-09-20) : "Phalaenopsis cornu-cervi" identifie
  // par Pl@ntNet n'a pas de correspondance exacte, mais la bibliotheque a
  // bien "Phalaenopsis" -> "Orchidée papillon" (fiche generique au niveau du
  // genre). Distinct de `libraryEntry` : sert UNIQUEMENT de nom d'appoint en
  // francais, jamais applique comme profil de soin (une espece precise peut
  // avoir des besoins differents du genre).
  genusLibraryEntry: LibraryEntryForMatch | null;
}

function genusOf(scientificName: string): string {
  return normalizeForSearch(scientificName).split(" ")[0] ?? "";
}

/**
 * Associe chaque candidat Pl@ntNet a une fiche de bibliotheque existante,
 * par nom scientifique (comparaison insensible a la casse et aux accents,
 * meme logique que la recherche de bibliotheque -- voir textSearch.ts).
 * Correspondance exacte uniquement pour `libraryEntry` : un nom scientifique
 * approchant mais different (ex. genre seul) resterait une fausse suggestion
 * de profil de soin.
 *
 * `genusLibraryEntry` complete cela pour le NOM uniquement : recherche une
 * fiche dont le nom scientifique est le genre seul (ex. "Phalaenopsis"),
 * volontairement plus permissive puisqu'elle ne sert jamais a pre-remplir
 * un profil de soin, seulement a proposer un nom francais plutot que le nom
 * anglais brut renvoye par Pl@ntNet quand aucune espece precise n'est
 * connue de la bibliotheque.
 */
export function matchLibraryEntries(candidates: PlantnetCandidate[], libraryEntries: LibraryEntryForMatch[]): IdentifiedCandidate[] {
  return candidates.map((candidate) => {
    const normalizedCandidate = normalizeForSearch(candidate.scientificName);
    const libraryEntry =
      libraryEntries.find((entry) => entry.scientificName && normalizeForSearch(entry.scientificName) === normalizedCandidate) ?? null;

    let genusLibraryEntry: LibraryEntryForMatch | null = null;
    if (!libraryEntry) {
      const candidateGenus = genusOf(candidate.scientificName);
      genusLibraryEntry =
        libraryEntries.find((entry) => entry.scientificName && genusOf(entry.scientificName) === candidateGenus && !entry.scientificName.includes(" ")) ??
        null;
    }

    return { ...candidate, libraryEntry, genusLibraryEntry };
  });
}
