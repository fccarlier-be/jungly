/**
 * Client pour les API Pl@ntNet (https://my.plantnet.org/doc/api/) --
 * identification d'espece (`identify`) et identification de maladies/
 * nuisibles (`diseases/identify`, lancee le 2025-12-02, verifie sur la doc
 * officielle et le changelog le 2026-09-23).
 *
 * Retour utilisateurs (2026-09) sur `identify` : demande d'identification
 * par photo, deja testee un an plus tot en interne sans bon resultat -- un
 * test manuel du 2026-09-20 sur 4 vraies photos de plantes Jungly (organe
 * "leaf" precise explicitement) a donne 3 identifications exactes a >70%
 * de confiance et une quatrieme juste au niveau du genre, donc nettement
 * mieux qu'attendu.
 *
 * Projet "all" (flore mondiale) plutot que "weurope" : la bibliotheque
 * Jungly couvre des especes d'interieur originaires de partout, pas
 * seulement la flore sauvage d'Europe de l'Ouest.
 */
import { z } from "zod";
import { isPlantnetQuotaAvailable, incrementPlantnetUsage } from "@/server/plantnet/quota";

const IDENTIFY_URL = "https://my-api.plantnet.org/v2/identify/all";
const DISEASES_URL = "https://my-api.plantnet.org/v2/diseases/identify";

// Pl@ntNet accepte jusqu'a 5 images du MEME individu par requete, et ca
// ameliore reellement le resultat (agregation ponderee : fleur > fruit >
// feuille > plante entiere > ecorce) -- verifie sur my.plantnet.org/doc/
// getting-started/faq le 2026-09-23. Au-dela, l'API rejette la requete.
export const PLANTNET_MAX_IMAGES = 5;

export class PlantnetError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "PlantnetError";
  }
}

/**
 * Distincte de PlantnetError generique : le blocage vient d'ICI (compteur
 * local, voir quota.ts), pas d'une reponse HTTP de Pl@ntNet -- status 429
 * quand meme (meme mapping cote apiError.ts) puisque la situation vecue par
 * l'appelant est identique ("reessayer plus tard").
 */
export class PlantnetQuotaExceededError extends PlantnetError {
  constructor() {
    super("Quota Pl@ntNet quotidien atteint pour cette instance (voir Parametres > A propos), reessayer demain.", 429);
    this.name = "PlantnetQuotaExceededError";
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
// testee manuellement avec de bons resultats. Ce sont les 5 SEULES valeurs
// acceptees par le parametre `organs` de l'API (docs.plantnet.org/reference/
// organs liste un glossaire plus large qui NE s'applique PAS a ce
// parametre -- verifie le 2026-09-23).
export const PLANTNET_ORGANS = ["auto", "leaf", "flower", "fruit", "bark"] as const;
export type PlantnetOrgan = (typeof PLANTNET_ORGANS)[number];

export interface PlantnetImageInput {
  buffer: Buffer;
  filename: string;
  organ: PlantnetOrgan;
}

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

function buildImagesForm(images: PlantnetImageInput[]): FormData {
  if (images.length === 0 || images.length > PLANTNET_MAX_IMAGES) {
    throw new PlantnetError(`Entre 1 et ${PLANTNET_MAX_IMAGES} images attendues, ${images.length} recue(s).`);
  }
  const form = new FormData();
  for (const image of images) {
    form.append("images", new Blob([new Uint8Array(image.buffer)]), image.filename);
    form.append("organs", image.organ);
  }
  return form;
}

/**
 * Verifie le quota local PUIS envoie la requete -- incremente le compteur
 * apres coup, que la reponse soit un succes, un "non reconnu", ou une
 * erreur Pl@ntNet (facture cote leur depuis le 2026-02-13, voir quota.ts).
 * Rien n'est incremente si `fetch` echoue avant d'atteindre Pl@ntNet.
 */
async function postToPlantnet(url: URL, form: FormData): Promise<Response> {
  if (!(await isPlantnetQuotaAvailable())) {
    throw new PlantnetQuotaExceededError();
  }
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: form });
  } catch {
    throw new PlantnetError("Pl@ntNet est injoignable pour le moment.");
  }
  await incrementPlantnetUsage();
  return res;
}

/**
 * Identifie une plante a partir d'une a cinq photos du MEME individu.
 * Renvoie un tableau vide (pas une erreur) quand Pl@ntNet ne reconnait
 * aucune espece sur les images -- documente comme "404 Species not found",
 * un resultat normal (mauvaise photo, sujet non vegetal) plutot qu'une
 * panne.
 */
export async function identifyPlant(images: PlantnetImageInput[]): Promise<PlantnetCandidate[]> {
  const url = new URL(IDENTIFY_URL);
  url.searchParams.set("api-key", getApiKey());
  url.searchParams.set("nb-results", "5");

  const res = await postToPlantnet(url, buildImagesForm(images));

  if (res.status === 404) {
    return [];
  }
  if (res.status === 429) {
    throw new PlantnetError("Quota Pl@ntNet atteint cote serveur Pl@ntNet, reessayer plus tard.", 429);
  }
  if (!res.ok) {
    throw new PlantnetError(`Pl@ntNet a repondu ${res.status}.`, res.status);
  }

  const parsed = plantnetIdentifyResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    console.error("Reponse Pl@ntNet (identify) inattendue :", parsed.error.flatten());
    throw new PlantnetError("Reponse Pl@ntNet invalide.");
  }

  return parsed.data.results.map((r) => ({
    scientificName: r.species.scientificNameWithoutAuthor,
    commonNames: r.species.commonNames ?? [],
    score: r.score,
  }));
}

export interface PlantnetDiseaseCandidate {
  /** Libelle lisible (champ `description` de l'API), jamais le code EPPO brut -- voir extractDiseaseName(). */
  name: string;
  eppoCode: string | null;
  score: number;
}

// Forme confirmee empiriquement le 2026-09-23 (premier vrai appel, voir
// doc officielle my.plantnet.org/doc/api/diseases) : chaque resultat a
// `name` (le CODE EPPO, ex. "PHYTOO" -- pas un nom lisible !), `score`
// (0-1) et `description` (le libelle humain, ex. "Phytophthora sp.").
// Avant ce correctif, `description` n'etait jamais lu : l'app affichait le
// code EPPO brut a l'utilisateur ("Suggestion Pl@ntNet : PHYTOO"),
// incomprehensible sans connaissance botanique -- retour utilisateur
// (2026-09-23), premiere vraie utilisation de cet endpoint.
const plantnetDiseaseCandidateSchema = z.object({
  name: z.string().max(50), // code EPPO
  score: z.number(),
  description: z.string().max(300).optional(),
});

const plantnetDiseasesResponseSchema = z.object({
  results: z.array(plantnetDiseaseCandidateSchema).optional().default([]),
});

function extractDiseaseName(raw: z.infer<typeof plantnetDiseaseCandidateSchema>): string {
  // `description` est absente pour de rares codes EPPO trop generiques
  // (constate en test reel) -- le code EPPO reste un dernier recours
  // lisible pour un botaniste, preferable a une chaine vide.
  return raw.description?.trim() || raw.name;
}

function extractEppoCode(raw: z.infer<typeof plantnetDiseaseCandidateSchema>): string {
  return raw.name;
}

/**
 * Identifie une maladie/un nuisible a partir d'une a cinq photos.
 * `/v2/diseases/identify` partage le MEME quota que `identify` (verifie sur
 * my.plantnet.org/doc/api/diseases le 2026-09-23) -- pas de comptage
 * separe cote quota.ts. Couverture d'especes/pathologies volontairement
 * limitee par Pl@ntNet au lancement : un tableau vide est un resultat
 * normal, pas une erreur.
 */
export async function identifyDiseases(images: PlantnetImageInput[]): Promise<PlantnetDiseaseCandidate[]> {
  const url = new URL(DISEASES_URL);
  url.searchParams.set("api-key", getApiKey());
  url.searchParams.set("nb-results", "5");

  const res = await postToPlantnet(url, buildImagesForm(images));

  if (res.status === 404) {
    return [];
  }
  if (res.status === 429) {
    throw new PlantnetError("Quota Pl@ntNet atteint cote serveur Pl@ntNet, reessayer plus tard.", 429);
  }
  if (!res.ok) {
    throw new PlantnetError(`Pl@ntNet (diseases) a repondu ${res.status}.`, res.status);
  }

  const rawBody = await res.json();
  const parsed = plantnetDiseasesResponseSchema.safeParse(rawBody);
  if (!parsed.success) {
    console.error("Reponse Pl@ntNet (diseases) inattendue :", parsed.error.flatten(), JSON.stringify(rawBody).slice(0, 2000));
    return []; // degrade en "aucun resultat" plutot que de casser tout le diagnostic pour un schema a recaler
  }

  return parsed.data.results.map((r) => ({
    name: extractDiseaseName(r),
    eppoCode: extractEppoCode(r),
    score: r.score,
  }));
}
