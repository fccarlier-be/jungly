import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { db } from "@/server/db";
import { NotFoundError, BadRequestError } from "@/lib/errors";
import { resolveUploadedFilePath } from "@/server/uploads";
import { resolveLibraryPhotoPath } from "@/server/libraryPhotos";
import { getHealthSummaries } from "@/server/careEngine/health";
import { getLibraryImageMap } from "@/lib/libraryImages";
import type { ShareStats } from "@/lib/shareCard";

// Meme garde-fou que pour les televersements (voir uploads.ts) : le
// decodage precede le redimensionnement.
const MAX_INPUT_PIXELS = 40_000_000;

export interface SharePhoto {
  id: string;
  url: string;
  createdAt: Date;
}

export interface SharePlant extends ShareStats {
  id: string;
  name: string;
  scientificName: string | null;
  coverUrl: string | null;
  // Galerie, de la plus ancienne a la plus recente (choix avant/apres).
  photos: SharePhoto[];
}

/** Plante + statistiques de la carte, uniquement si elle appartient a userId. */
export async function loadSharePlant(userId: string, plantId: string): Promise<SharePlant> {
  const plant = await db.plant.findFirst({
    where: { id: plantId, userId },
    include: { photos: { orderBy: { createdAt: "asc" } } },
  });
  if (!plant) throw new NotFoundError("Plante introuvable.");

  const [waterings, fertilizings, health] = await Promise.all([
    db.careEvent.count({ where: { plantId, type: "WATERING" } }),
    db.careEvent.count({ where: { plantId, type: "FERTILIZING" } }),
    getHealthSummaries([plantId]),
  ]);

  let coverUrl = plant.photoUrl;
  if (!coverUrl && plant.scientificName) {
    coverUrl = (await getLibraryImageMap([plant.scientificName])).get(plant.scientificName) ?? null;
  }

  return {
    id: plant.id,
    name: plant.name,
    scientificName: plant.scientificName,
    coverUrl,
    photos: plant.photos.map((p) => ({ id: p.id, url: p.url, createdAt: p.createdAt })),
    since: plant.acquiredAt ?? plant.createdAt,
    waterings,
    fertilizings,
    healthLevel: health.get(plantId)?.current.level ?? null,
  };
}

/** Photo de la galerie de CETTE plante (refuse l'id d'une photo d'une autre plante). */
export function pickPlantPhoto(plant: SharePlant, photoId: string): SharePhoto {
  const photo = plant.photos.find((p) => p.id === photoId);
  if (!photo) throw new BadRequestError("Photo introuvable pour cette plante.");
  return photo;
}

/**
 * Lit une photo locale (televersement prive ou photo de bibliotheque) et la
 * renvoie recadree aux dimensions voulues, en data URL JPEG -- format
 * attendu par le moteur de rendu de la carte (satori), qui ne peut pas
 * suivre une URL /uploads/... protegee par session. Une URL externe (mirroring
 * echoue, voir resolvePhotoUrl) n'est jamais telechargee ici : null, la
 * carte affiche alors un fond neutre.
 */
export async function loadPhotoDataUrl(url: string | null, width: number, height: number): Promise<string | null> {
  if (!url) return null;
  let filePath: string;
  if (url.startsWith("/uploads/")) filePath = resolveUploadedFilePath(url.slice("/uploads/".length));
  else if (url.startsWith("/library-photos/")) filePath = resolveLibraryPhotoPath(url.slice("/library-photos/".length));
  else return null;

  try {
    const input = await readFile(filePath);
    const output = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(Math.round(width), Math.round(height), { fit: "cover", position: "attention" })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${output.toString("base64")}`;
  } catch {
    // Fichier absent ou illisible : la carte reste generee, sans photo.
    return null;
  }
}
