/**
 * Photos de reference via l'API publique iNaturalist (aucune cle requise).
 * Utilisee comme source d'image secondaire quand une fiche de bibliotheque
 * n'en a pas (ex. plantfolio-common-plants n'inclut aucune photo).
 *
 * Important : le `default_photo` d'un taxon iNaturalist est souvent "(c)
 * <auteur>, all rights reserved" (license_code: null) -- ce n'est PAS une
 * photo reutilisable. On interroge donc les observations en filtrant
 * explicitement sur les licences ouvertes (photo_license=cc-by,...), jamais
 * le taxon directement.
 */

const BASE_URL = "https://api.inaturalist.org/v1";
const USER_AGENT = "PlantManagerHomelab/1.0 (self-hosted personal app, non-commercial)";
const OPEN_LICENSES = ["cc0", "cc-by", "cc-by-nc", "cc-by-sa", "cc-by-nc-sa", "cc-by-nd", "cc-by-nc-nd"];

export interface INaturalistPhoto {
  url: string;
  attribution: string;
  licenseCode: string;
  observationUrl: string;
}

async function iNatFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function findTaxonId(scientificName: string): Promise<number | null> {
  const body = await iNatFetch<{ results: { id: number }[] }>(
    `/taxa?q=${encodeURIComponent(scientificName)}&per_page=1&rank=species,subspecies,variety,genus`,
  );
  return body?.results?.[0]?.id ?? null;
}

/** Cherche une photo sous licence ouverte pour un nom scientifique donne, ou null si aucune trouvee. */
export async function findOpenLicensedPhoto(scientificName: string): Promise<INaturalistPhoto | null> {
  const taxonId = await findTaxonId(scientificName);
  if (!taxonId) return null;

  const body = await iNatFetch<{
    results: { id: number; photos: { url: string; attribution: string; license_code: string | null }[] }[];
  }>(`/observations?taxon_id=${taxonId}&photos=true&photo_license=${OPEN_LICENSES.join(",")}&per_page=5&order_by=votes&quality_grade=research`);

  // `photo_license` filtre les OBSERVATIONS ayant au moins une photo sous
  // licence ouverte -- une observation peut avoir plusieurs photos, pas
  // toutes forcement licenciees. On ne garde que celle(s) qui le sont
  // vraiment, jamais `photos[0]` a l'aveugle.
  let observation: { id: number } | undefined;
  let photo: { url: string; attribution: string; license_code: string | null } | undefined;
  for (const candidate of body?.results ?? []) {
    const licensedPhoto = candidate.photos.find((p) => p.license_code && OPEN_LICENSES.includes(p.license_code));
    if (licensedPhoto) {
      observation = candidate;
      photo = licensedPhoto;
      break;
    }
  }
  if (!observation || !photo?.url || !photo.license_code) return null;

  return {
    url: photo.url.replace(/square\.(jpe?g|png)$/, "medium.$1"),
    attribution: photo.attribution,
    licenseCode: photo.license_code,
    observationUrl: `https://www.inaturalist.org/observations/${observation.id}`,
  };
}
