import { searchPerenualSpecies, getPerenualSpeciesDetails } from "@/server/perenual/client";
import { toPreview as perenualPreview, mapCareProfile as perenualCareProfile, mapImage as perenualImage } from "@/server/perenual/mapping";
import { isOpenPlantbookConfigured, searchPlantbookSpecies, getPlantbookSpeciesDetails } from "@/server/openplantbook/client";
import { toPreview as plantbookPreview, mapCareProfile as plantbookCareProfile, mapImage as plantbookImage, extractFamily as plantbookFamily } from "@/server/openplantbook/mapping";
import type { ExternalDetails, ExternalPreview, ExternalProvider, ExternalSource } from "./types";

const openPlantbookProvider: ExternalProvider = {
  source: "OPENPLANTBOOK",
  label: "OpenPlantbook",
  isConfigured: isOpenPlantbookConfigured,
  async search(query) {
    const res = await searchPlantbookSpecies(query);
    return res.results.map((item) => ({ source: "OPENPLANTBOOK", ...plantbookPreview(item) }));
  },
  async getDetails(sourceId) {
    const detail = await getPlantbookSpeciesDetails(sourceId);
    return {
      source: "OPENPLANTBOOK",
      sourceId,
      commonName: detail.display_pid?.trim() || detail.alias?.trim() || sourceId,
      scientificName: detail.pid?.trim() || null,
      family: plantbookFamily(detail.category),
      careProfile: plantbookCareProfile(detail),
      image: plantbookImage(detail),
    };
  },
};

const perenualProvider: ExternalProvider = {
  source: "PERENUAL",
  label: "Perenual",
  isConfigured: () => Boolean(process.env.PERENUAL_API_KEY),
  async search(query) {
    const res = await searchPerenualSpecies(query);
    return res.data.map((item) => ({ source: "PERENUAL", ...perenualPreview(item) }));
  },
  async getDetails(sourceId) {
    const detail = await getPerenualSpeciesDetails(sourceId);
    return {
      source: "PERENUAL",
      sourceId,
      commonName: detail.common_name?.trim() || detail.scientific_name?.[0] || "Espèce sans nom",
      scientificName: detail.scientific_name?.[0] ?? null,
      family: detail.family ?? null,
      careProfile: perenualCareProfile(detail),
      image: perenualImage(detail),
    };
  },
};

/**
 * Ordre de repli explicitement demande : OpenPlantbook (oriente soin) en
 * premier, Perenual (quota gratuit plus restreint : 3000 especes / 100
 * requetes par jour) en dernier recours.
 */
export const PROVIDERS: ExternalProvider[] = [openPlantbookProvider, perenualProvider];

export function getProvider(source: ExternalSource): ExternalProvider {
  const provider = PROVIDERS.find((p) => p.source === source);
  if (!provider) throw new Error(`Source externe inconnue : ${source}`);
  return provider;
}

/**
 * Recherche dans l'ordre de priorite, s'arrete au premier fournisseur
 * configure qui trouve quelque chose. Un fournisseur en erreur (quota
 * atteint, panne reseau...) ne doit jamais bloquer le repli sur le suivant --
 * c'est precisement la raison d'etre d'une chaine de secours.
 */
export async function searchExternal(query: string): Promise<{ source: ExternalSource | null; results: ExternalPreview[] }> {
  for (const provider of PROVIDERS) {
    if (!provider.isConfigured()) continue;
    try {
      const results = await provider.search(query);
      if (results.length > 0) return { source: provider.source, results };
    } catch (error) {
      console.error(
        `[externalSpecies] ${provider.label} indisponible, repli sur la source suivante :`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return { source: null, results: [] };
}

/**
 * Recupere la fiche detaillee d'une source precise puis, si un champ cle
 * (l'arrosage -- central au reste de l'application) manque encore, complete
 * silencieusement via Perenual (recherche par nom scientifique/commun,
 * meilleur resultat) sans ecraser les champs deja fournis par la source
 * principale. Ne s'applique que lorsque la source principale n'est pas deja
 * Perenual lui-meme.
 */
export async function getExternalDetails(source: ExternalSource, sourceId: string): Promise<ExternalDetails> {
  const details = await getProvider(source).getDetails(sourceId);

  if (!details.careProfile.watering && source !== "PERENUAL" && perenualProvider.isConfigured()) {
    try {
      const query = details.scientificName || details.commonName;
      const searchRes = await perenualProvider.search(query);
      const best = searchRes[0];
      if (best) {
        const fallbackDetails = await perenualProvider.getDetails(best.sourceId);
        if (fallbackDetails.careProfile.watering) {
          details.careProfile.watering = fallbackDetails.careProfile.watering;
          details.completedFrom = "PERENUAL";
        }
        if (!details.careProfile.toxicity && fallbackDetails.careProfile.toxicity) {
          details.careProfile.toxicity = fallbackDetails.careProfile.toxicity;
        }
      }
    } catch {
      // Le complement est un bonus, jamais bloquant : la fiche principale reste utilisable telle quelle.
    }
  }

  return details;
}
