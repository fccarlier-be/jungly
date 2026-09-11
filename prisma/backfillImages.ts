/**
 * Script de rattrapage ponctuel (pas execute au demarrage du conteneur) :
 * comble les photos manquantes dans la bibliotheque, pour les fiches qui ont
 * un nom scientifique mais pas encore d'image (essentiellement les profils
 * plantfolio-common-plants, qui n'incluent aucune photo). Essaie dans l'ordre
 * OpenPlantbook (oriente plantes cultivees, mieux assorti a ce type de
 * fiche), iNaturalist (couverture large, observations naturalistes), puis
 * GBIF (agrege des dizaines de fournisseurs, utile en dernier recours).
 *
 * A relancer manuellement (`npx tsx prisma/backfillImages.ts`) si de
 * nouvelles fiches sans photo apparaissent. Une requete a la fois avec une
 * pause, jamais en parallele, par courtoisie envers ces API publiques.
 */
import { Prisma } from "@generated/prisma/client";
import { isOpenPlantbookConfigured, findPlantbookImage } from "../src/server/openplantbook/client";
import { findOpenLicensedPhoto as findINaturalistPhoto } from "../src/server/inaturalist/client";
import { findOpenLicensedPhoto as findGbifPhoto } from "../src/server/gbif/client";
import { db } from "../src/server/db";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FoundImage {
  imageUrl: string;
  imageSource: string;
  imageSourceUrl: string | null;
  // Qui crediter (ex. "(c) Jane Doe, some rights reserved") -- distinct de
  // la licence elle-meme (ex. "CC BY-NC 4.0"). Ces deux informations
  // etaient auparavant confondues dans imageLicense pour iNaturalist/GBIF.
  imageAuthor: string | null;
  imageLicense: string | null;
  imageLicenseUrl: string | null;
}

/** "cc-by-nc" -> "CC BY-NC 4.0", "cc0" -> "CC0 1.0". */
function formatINaturalistLicense(licenseCode: string): string {
  if (licenseCode === "cc0") return "CC0 1.0";
  return `CC ${licenseCode.replace(/^cc-/, "").toUpperCase()} 4.0`;
}

function inaturalistLicenseUrl(licenseCode: string): string {
  if (licenseCode === "cc0") return "https://creativecommons.org/publicdomain/zero/1.0/";
  return `https://creativecommons.org/licenses/${licenseCode.replace(/^cc-/, "")}/4.0/`;
}

/** GBIF ne fournit qu'une url de licence (ex. ".../licenses/by-nc/4.0/legalcode") -- on en derive un libelle lisible. */
function formatGbifLicense(licenseUrl: string): string {
  const publicDomain = licenseUrl.match(/publicdomain\/zero\/([\d.]+)/i);
  if (publicDomain) return `CC0 ${publicDomain[1]}`;
  const cc = licenseUrl.match(/licenses\/([a-z-]+)\/([\d.]+)/i);
  if (cc) return `CC ${cc[1].toUpperCase()} ${cc[2]}`;
  return "Licence ouverte";
}

type Source = { name: string; find: (scientificName: string) => Promise<FoundImage | null> };

const SOURCES: Source[] = [
  {
    name: "OpenPlantbook",
    find: async (name) => {
      if (!isOpenPlantbookConfigured()) return null;
      const url = await findPlantbookImage(name);
      // Ni licence ni auteur fournis par OpenPlantbook pour cette photo --
      // on ne fabrique pas une fausse licence (voir #13 dans le suivi) ;
      // imageSource identifie deja la provenance sans ambiguite.
      return url
        ? { imageUrl: url, imageSource: "OPENPLANTBOOK", imageSourceUrl: "https://open.plantbook.io", imageAuthor: null, imageLicense: null, imageLicenseUrl: null }
        : null;
    },
  },
  {
    name: "iNaturalist",
    find: async (name) => {
      const photo = await findINaturalistPhoto(name);
      return photo
        ? {
            imageUrl: photo.url,
            imageSource: "INATURALIST",
            imageSourceUrl: photo.observationUrl,
            imageAuthor: photo.attribution,
            imageLicense: formatINaturalistLicense(photo.licenseCode),
            imageLicenseUrl: inaturalistLicenseUrl(photo.licenseCode),
          }
        : null;
    },
  },
  {
    name: "GBIF",
    find: async (name) => {
      const photo = await findGbifPhoto(name);
      return photo
        ? {
            imageUrl: photo.url,
            imageSource: "GBIF",
            imageSourceUrl: photo.observationUrl,
            imageAuthor: photo.attribution,
            imageLicense: formatGbifLicense(photo.licenseUrl),
            imageLicenseUrl: photo.licenseUrl,
          }
        : null;
    },
  },
];

async function main() {
  const entries = await db.plantLibraryEntry.findMany({
    where: { scientificName: { not: null } },
    select: { id: true, scientificName: true, careProfile: true },
  });

  const missing = entries.filter((e) => !(e.careProfile as { imageUrl?: string } | null)?.imageUrl);
  console.log(`${missing.length} fiche(s) sans photo sur ${entries.length} avec un nom scientifique.`);
  console.log(`OpenPlantbook ${isOpenPlantbookConfigured() ? "activé" : "non configuré, ignoré"}.`);

  const foundBySource: Record<string, number> = {};
  let notFound = 0;

  for (const [i, entry] of missing.entries()) {
    const scientificName = entry.scientificName!;
    try {
      let found: FoundImage | null = null;
      for (const source of SOURCES) {
        found = await source.find(scientificName);
        if (found) break;
      }
      if (found) {
        const careProfile = { ...(entry.careProfile as Record<string, unknown> | null), imageUrl: found.imageUrl };
        await db.plantLibraryEntry.update({
          where: { id: entry.id },
          data: {
            careProfile: careProfile as unknown as Prisma.InputJsonValue,
            imageSource: found.imageSource,
            imageSourceUrl: found.imageSourceUrl,
            imageAuthor: found.imageAuthor,
            imageLicense: found.imageLicense,
            imageLicenseUrl: found.imageLicenseUrl,
          },
        });
        foundBySource[found.imageSource] = (foundBySource[found.imageSource] ?? 0) + 1;
      } else {
        notFound += 1;
      }
    } catch (error) {
      console.error(`Erreur pour ${scientificName} :`, error instanceof Error ? error.message : error);
      notFound += 1;
    }
    if ((i + 1) % 25 === 0) {
      const totalFound = Object.values(foundBySource).reduce((a, b) => a + b, 0);
      console.log(`... ${i + 1}/${missing.length} traitées (${totalFound} trouvées : ${JSON.stringify(foundBySource)})`);
    }
    await sleep(300);
  }

  const totalFound = Object.values(foundBySource).reduce((a, b) => a + b, 0);
  console.log(`Terminé : ${totalFound} photo(s) ajoutée(s) (${JSON.stringify(foundBySource)}), ${notFound} sans résultat.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
