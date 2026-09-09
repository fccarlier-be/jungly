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

async function plantbookFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) {
    throw new OpenPlantbookError("Quota OpenPlantbook atteint, réessayer plus tard.", 429);
  }
  if (!res.ok) {
    throw new OpenPlantbookError(`OpenPlantbook a répondu ${res.status}.`, res.status);
  }
  return (await res.json()) as T;
}

export interface PlantbookSearchItem {
  pid: string;
  display_pid?: string;
  alias?: string;
  category?: string;
}

export interface PlantbookSearchResponse {
  count: number;
  results: PlantbookSearchItem[];
}

export interface PlantbookDetail extends PlantbookSearchItem {
  max_light_mmol?: number;
  min_light_mmol?: number;
  max_light_lux?: number;
  min_light_lux?: number;
  max_temp?: number;
  min_temp?: number;
  max_env_humid?: number;
  min_env_humid?: number;
  max_soil_moist?: number;
  min_soil_moist?: number;
  max_soil_ec?: number;
  min_soil_ec?: number;
  image_url?: string;
}

export function searchPlantbookSpecies(query: string): Promise<PlantbookSearchResponse> {
  return plantbookFetch<PlantbookSearchResponse>(`/plant/search?alias=${encodeURIComponent(query)}&limit=20`);
}

export function getPlantbookSpeciesDetails(pid: string): Promise<PlantbookDetail> {
  return plantbookFetch<PlantbookDetail>(`/plant/detail/${encodeURIComponent(pid)}`);
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
