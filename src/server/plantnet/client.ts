/**
 * Client pour l'API d'identification par photo Pl@ntNet
 * (https://my.plantnet.org/doc/api/identify). Retour utilisateurs (2026-09) :
 * demande d'identification par photo, deja testee un an plus tot en interne
 * sans bon resultat -- un test manuel du 2026-09-20 sur 4 vraies photos de
 * plantes Jungly (organe "leaf" precise explicitement) a donne 3
 * identifications exactes a >70% de confiance et une quatrieme juste au
 * niveau du genre, donc nettement mieux qu'attendu.
 *
 * Projet "all" (flore mondiale) plutot que "weurope" : la bibliotheque
 * Jungly couvre des especes d'interieur originaires de partout, pas
 * seulement la flore sauvage d'Europe de l'Ouest.
 */
import { z } from "zod";

const BASE_URL = "https://my-api.plantnet.org/v2/identify/all";

export class PlantnetError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "PlantnetError";
  }
}

function getApiKey(): string {
  const key = process.env.PLANTNET_API_KEY;
  if (!key) {
    throw new PlantnetError("Cle API Pl@ntNet absente (PLANTNET_API_KEY).");
  }
  return key;
}

// "auto" laisse l'IA Pl@ntNet deviner l'organe photographie -- retenu comme
// choix par defaut cote UI car la terminologie botanique (feuille/fleur/
// fruit/ecorce) n'est pas evidente pour un utilisateur non initie. Les 4
// valeurs manuelles restent proposees en repli, "leaf" etant la seule
// testee manuellement avec de bons resultats.
export const PLANTNET_ORGANS = ["auto", "leaf", "flower", "fruit", "bark"] as const;
export type PlantnetOrgan = (typeof PLANTNET_ORGANS)[number];

// Validation minimale et permissive (meme raisonnement que
// src/server/perenual/client.ts) : uniquement les champs reellement lus
// ci-dessous, `.object()` (pas `.strict()`) pour ignorer sans casser tout
// champ ajoute un jour par l'API.
const plantnetSpeciesSchema = z.object({
  scientificNameWithoutAuthor: z.string().max(300),
  commonNames: z.array(z.string().max(200)).optional(),
});

const plantnetResultSchema = z.object({
  score: z.number(),
  species: plantnetSpeciesSchema,
});

const plantnetIdentifyResponseSchema = z.object({
  results: z.array(plantnetResultSchema),
});

export interface PlantnetCandidate {
  scientificName: string;
  commonNames: string[];
  score: number;
}

/**
 * Identifie une plante a partir d'une photo. Renvoie un tableau vide (pas
 * une erreur) quand Pl@ntNet ne reconnait aucune espece sur l'image --
 * documente comme "404 Species not found", un resultat normal (mauvaise
 * photo, sujet non vegetal) plutot qu'une panne.
 */
export async function identifyPlant(imageBuffer: Buffer, filename: string, organ: PlantnetOrgan): Promise<PlantnetCandidate[]> {
  const url = new URL(BASE_URL);
  url.searchParams.set("api-key", getApiKey());
  url.searchParams.set("nb-results", "5");

  const form = new FormData();
  form.append("images", new Blob([new Uint8Array(imageBuffer)]), filename);
  form.append("organs", organ);

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: form });
  } catch {
    throw new PlantnetError("Pl@ntNet est injoignable pour le moment.");
  }

  if (res.status === 404) {
    return [];
  }
  if (res.status === 429) {
    throw new PlantnetError("Quota Pl@ntNet atteint (500 identifications/jour, partage entre les instances), reessayer plus tard.", 429);
  }
  if (!res.ok) {
    throw new PlantnetError(`Pl@ntNet a repondu ${res.status}.`, res.status);
  }

  const parsed = plantnetIdentifyResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    console.error("Reponse Pl@ntNet inattendue :", parsed.error.flatten());
    throw new PlantnetError("Reponse Pl@ntNet invalide.");
  }

  return parsed.data.results.map((r) => ({
    scientificName: r.species.scientificNameWithoutAuthor,
    commonNames: r.species.commonNames ?? [],
    score: r.score,
  }));
}
