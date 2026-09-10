// Open-Meteo : gratuit, sans cle API -- meme logique que OpenPlantbook /
// iNaturalist / GBIF ailleurs dans l'app (voir externalSpecies/).

export interface GeocodeCandidate {
  name: string;
  country: string | null;
  admin1: string | null;
  latitude: number;
  longitude: number;
}

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
  const body = (await res.json()) as {
    results?: { name: string; country?: string; admin1?: string; latitude: number; longitude: number }[];
  };

  return (body.results ?? []).map((r) => ({
    name: r.name,
    country: r.country ?? null,
    admin1: r.admin1 ?? null,
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

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
  const body = (await res.json()) as { daily?: { temperature_2m_max?: number[] } };
  const temps = body.daily?.temperature_2m_max;
  if (!temps || temps.length === 0) {
    throw new Error("Reponse meteo inattendue (aucune temperature).");
  }
  return temps;
}
