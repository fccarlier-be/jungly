/**
 * Client pour l'API OpenPlantbook (https://open.plantbook.io), source
 * externe orientee "soin des plantes" (seuils de lumiere/temperature/
 * humidite/arrosage), utilisee en PREMIER recours avant Perenual.
 *
 * Authentification OAuth2 client_credentials (client_id + secret, pas une
 * simple cle) -- confirme via le code source de la librairie officielle
 * python-openplantbook (github.com/Olen/python-openplantbook), qui documente
 * aussi les endpoints ci-dessous. En revanche les noms exacts des champs de
 * reponse (search/detail) n'ont pas pu etre verifies sans compte reel :
 * `mapping.ts` reste donc a confirmer/ajuster une fois des identifiants
 * disponibles -- meme demarche que pour Perenual, ou ce genre d'hypothese
 * avait revele deux erreurs a la premiere vraie requete.
 */
import { z } from "zod";

const BASE_URL = "https://open.plantbook.io/api/v1";

export class OpenPlantbookError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "OpenPlantbookError";
  }
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

function getCredentials(): { clientId: string; secret: string } {
  const clientId = process.env.OPENPLANTBOOK_CLIENT_ID;
  const secret = process.env.OPENPLANTBOOK_CLIENT_SECRET;
  if (!clientId || !secret) {
    throw new OpenPlantbookError("Identifiants OpenPlantbook absents (OPENPLANTBOOK_CLIENT_ID/SECRET).");
  }
  return { clientId, secret };
}

export function isOpenPlantbookConfigured(): boolean {
  return Boolean(process.env.OPENPLANTBOOK_CLIENT_ID && process.env.OPENPLANTBOOK_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.accessToken;
  }

  const { clientId, secret } = getCredentials();
  const res = await fetch(`${BASE_URL}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: secret }),
  });
  if (!res.ok) {
    throw new OpenPlantbookError(`Authentification OpenPlantbook refusée (${res.status}).`, res.status);
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { accessToken: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return tokenCache.accessToken;
}

// Validation minimale et permissive (audit security2.md/Copilot,
// 2026-09-12), meme demarche que perenual/client.ts -- seulement les
// champs lus par mapping.ts, tous optionnels/nullable sauf `pid` (deja
// requis dans le contrat existant). D'autant plus justifie ici que les noms
// de champs sont EUX-MEMES non confirmes (voir commentaire de fichier) :
// mieux vaut echouer proprement sur une reponse qui ne colle pas du tout a
// l'hypothese plutot que de laisser un mapping silencieusement incorrect.
const plantbookSearchItemSchema = z.object({
  pid: z.string().max(500),
  display_pid: z.string().max(500).optional().nullable(),
  alias: z.string().max(500).optional().nullable(),
  category: z.string().max(500).optional().nullable(),
});

const plantbookSearchResponseSchema = z.object({
  count: z.number(),
  results: z.array(plantbookSearchItemSchema),
});

const plantbookDetailSchema = plantbookSearchItemSchema.extend({
  max_light_mmol: z.number().optional().nullable(),
  min_light_mmol: z.number().optional().nullable(),
  max_light_lux: z.number().optional().nullable(),
  min_light_lux: z.number().optional().nullable(),
  max_temp: z.number().optional().nullable(),
  min_temp: z.number().optional().nullable(),
  max_env_humid: z.number().optional().nullable(),
  min_env_humid: z.number().optional().nullable(),
  max_soil_moist: z.number().optional().nullable(),
  min_soil_moist: z.number().optional().nullable(),
  max_soil_ec: z.number().optional().nullable(),
  min_soil_ec: z.number().optional().nullable(),
  image_url: z.string().max(2000).optional().nullable(),
});

export type PlantbookSearchItem = z.infer<typeof plantbookSearchItemSchema>;
export type PlantbookSearchResponse = z.infer<typeof plantbookSearchResponseSchema>;
export type PlantbookDetail = z.infer<typeof plantbookDetailSchema>;

async function plantbookFetch<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) {
    throw new OpenPlantbookError("Quota OpenPlantbook atteint, réessayer plus tard.", 429);
  }
  if (!res.ok) {
    throw new OpenPlantbookError(`OpenPlantbook a répondu ${res.status}.`, res.status);
  }
  // Reponse validee avant de faire confiance a sa forme (audit security2.md).
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) {
    console.error(`Reponse OpenPlantbook inattendue pour ${path} :`, parsed.error.flatten());
    throw new OpenPlantbookError("Reponse OpenPlantbook invalide.");
  }
  return parsed.data;
}

export function searchPlantbookSpecies(query: string): Promise<PlantbookSearchResponse> {
  return plantbookFetch(`/plant/search?alias=${encodeURIComponent(query)}&limit=20`, plantbookSearchResponseSchema);
}

export function getPlantbookSpeciesDetails(pid: string): Promise<PlantbookDetail> {
  return plantbookFetch(`/plant/detail/${encodeURIComponent(pid)}`, plantbookDetailSchema);
}

/** Cherche une photo OpenPlantbook pour un nom scientifique donne (recherche puis fiche detail), ou null. */
export async function findPlantbookImage(scientificName: string): Promise<string | null> {
  try {
    const search = await searchPlantbookSpecies(scientificName);
    const pid = search.results?.[0]?.pid;
    if (!pid) return null;
    const detail = await getPlantbookSpeciesDetails(pid);
    return detail.image_url ?? null;
  } catch {
    return null;
  }
}
