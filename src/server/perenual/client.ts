/**
 * Client bas niveau pour l'API Perenual (https://www.perenual.com/docs/api).
 * Source externe principale pour completer la bibliotheque locale sans avoir
 * a saisir une fiche a la main pour chaque nouvelle espece.
 *
 * Le quota exact du plan gratuit n'est pas documente publiquement (voir
 * discussion) -- on suppose donc un quota bas et on n'appelle Perenual que
 * sur action explicite de l'utilisateur (jamais en arriere-plan ni a chaque
 * frappe clavier), jamais pour re-afficher une fiche deja importee.
 */
import { z } from "zod";

const BASE_URL = "https://www.perenual.com/api/v2";

export class PerenualError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "PerenualError";
  }
}

function getApiKey(): string {
  const key = process.env.PERENUAL_API_KEY;
  if (!key) {
    throw new PerenualError("Cle API Perenual absente (PERENUAL_API_KEY).");
  }
  return key;
}

// Validation minimale et permissive (audit security2.md/Copilot,
// 2026-09-12) : on ne valide QUE les champs reellement lus par mapping.ts,
// tous optionnels/nullable (Perenual peut omettre n'importe quel champ
// selon l'espece), avec un plafond de longueur genereux sur le texte libre
// -- pas de validation de format (URL, enum...) qui casserait sur une
// valeur legitime mais inattendue. `.object()` (pas `.strict()`) ignore
// silencieusement tout champ inconnu : un champ ajoute un jour par
// l'API ne casse jamais le parsing.
const perenualImageSchema = z.object({
  license: z.number().optional().nullable(),
  license_name: z.string().max(500).optional().nullable(),
  license_url: z.string().max(2000).optional().nullable(),
  original_url: z.string().max(2000).optional().nullable(),
  regular_url: z.string().max(2000).optional().nullable(),
  medium_url: z.string().max(2000).optional().nullable(),
  small_url: z.string().max(2000).optional().nullable(),
  thumbnail: z.string().max(2000).optional().nullable(),
});

const perenualSpeciesListItemSchema = z.object({
  id: z.number(),
  common_name: z.string().max(500).optional().nullable(),
  scientific_name: z.array(z.string().max(500)).optional(),
  family: z.string().max(500).optional().nullable(),
  default_image: perenualImageSchema.optional().nullable(),
});

const perenualSpeciesListResponseSchema = z.object({
  data: z.array(perenualSpeciesListItemSchema),
  total: z.number(),
  current_page: z.number(),
  last_page: z.number(),
});

const perenualSpeciesDetailsSchema = perenualSpeciesListItemSchema.extend({
  watering: z.string().max(200).optional().nullable(),
  watering_general_benchmark: z
    .object({ value: z.string().max(200).optional().nullable(), unit: z.string().max(200).optional().nullable() })
    .optional()
    .nullable(),
  sunlight: z.array(z.string().max(200)).optional().nullable(),
  care_level: z.string().max(200).optional().nullable(),
  indoor: z.boolean().optional(),
  // Observe tel quel dans l'API malgre la doc (parfois 0/1, parfois booleen) --
  // mapping.ts fait deja `Boolean(...)`, les deux formes doivent donc passer.
  poisonous_to_humans: z.union([z.number(), z.boolean()]).optional().nullable(),
  poisonous_to_pets: z.union([z.number(), z.boolean()]).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
});

export type PerenualImageVariants = z.infer<typeof perenualImageSchema>;
export type PerenualSpeciesListItem = z.infer<typeof perenualSpeciesListItemSchema>;
export type PerenualSpeciesListResponse = z.infer<typeof perenualSpeciesListResponseSchema>;
export type PerenualSpeciesDetails = z.infer<typeof perenualSpeciesDetailsSchema>;

async function perenualFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("key", getApiKey());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 429) {
    throw new PerenualError("Quota Perenual atteint, reessayer plus tard.", 429);
  }
  if (!res.ok) {
    throw new PerenualError(`Perenual a repondu ${res.status}.`, res.status);
  }
  // Reponse validee avant de faire confiance a sa forme (audit security2.md) :
  // sans ca, une reponse Perenual malformee ou corrompue (panne, MITM sur un
  // deploiement sans certificate pinning) etait simplement castee en T sans
  // aucune verification a l'execution.
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) {
    console.error(`Reponse Perenual inattendue pour ${path} :`, parsed.error.flatten());
    throw new PerenualError("Reponse Perenual invalide.");
  }
  return parsed.data;
}

export function searchPerenualSpecies(query: string, page = 1): Promise<PerenualSpeciesListResponse> {
  return perenualFetch("/species-list", perenualSpeciesListResponseSchema, { q: query, page });
}

export function getPerenualSpeciesDetails(id: number | string): Promise<PerenualSpeciesDetails> {
  return perenualFetch(`/species/details/${id}`, perenualSpeciesDetailsSchema);
}
