// Open-Meteo : gratuit, sans cle API -- meme logique que OpenPlantbook /
// iNaturalist / GBIF ailleurs dans l'app (voir externalSpecies/).
import { z } from "zod";

export interface GeocodeCandidate {
  name: string;
  country: string | null;
  admin1: string | null;
  latitude: number;
  longitude: number;
}

// Validation minimale et permissive (audit security2.md/Copilot,
// 2026-09-12) : seulement les champs lus ci-dessous, `latitude`/`longitude`
// requis (utilises tels quels ensuite comme coordonnees, pas de sens de les
// laisser optionnels), le reste nullable/optionnel avec un plafond de
// longueur genereux sur le texte libre.
const geocodeResponseSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string().max(500),
        country: z.string().max(500).optional().nullable(),
        admin1: z.string().max(500).optional().nullable(),
        latitude: z.number(),
        longitude: z.number(),
      }),
    )
    .optional(),
});

/** Recherche une ville par nom, renvoie les correspondances possibles (l'utilisateur choisit la bonne). */
export async function geocodeCity(query: string): Promise<GeocodeCandidate[]> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "fr");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Recherche de ville indisponible pour le moment.");
  }
  // Reponse validee avant de faire confiance a sa forme (audit security2.md).
  const parsed = geocodeResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    console.error("Reponse Open-Meteo (geocodage) inattendue :", parsed.error.flatten());
    throw new Error("Reponse de geocodage invalide.");
  }

  return (parsed.data.results ?? []).map((r) => ({
    name: r.name,
    country: r.country ?? null,
    admin1: r.admin1 ?? null,
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

const forecastResponseSchema = z.object({
  daily: z.object({ temperature_2m_max: z.array(z.number()).optional() }).optional(),
});

/**
 * Temperatures maximales journalieres : 3 derniers jours (donnees reelles) +
 * aujourd'hui et demain (prevision) -- une fenetre courte volontairement,
 * pour reagir a une vague de chaleur qui arrive sans se baser sur une
 * moyenne trop lissee.
 */
export async function fetchRecentMaxTemperatures(latitude: number, longitude: number): Promise<number[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("daily", "temperature_2m_max");
  url.searchParams.set("past_days", "3");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Donnees meteo indisponibles pour le moment.");
  }
  // Reponse validee avant de faire confiance a sa forme (audit security2.md).
  const parsed = forecastResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    console.error("Reponse Open-Meteo (prevision) inattendue :", parsed.error.flatten());
    throw new Error("Reponse meteo invalide.");
  }
  const temps = parsed.data.daily?.temperature_2m_max;
  if (!temps || temps.length === 0) {
    throw new Error("Reponse meteo inattendue (aucune temperature).");
  }
  return temps;
}
