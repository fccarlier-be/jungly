import { unlink, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "@/server/db";
import { BadRequestError } from "@/lib/errors";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const ALLOWED_MIRROR_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_MIRROR_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_MIRROR_DIMENSION = 1600;
const MIRROR_JPEG_QUALITY = 82;

/** Chemin disque d'un fichier uploade a partir de son seul nom -- path.basename() empeche toute traversee de repertoire. */
export function resolveUploadedFilePath(filename: string): string {
  return path.join(UPLOAD_DIR, path.basename(filename));
}

/**
 * Supprime physiquement un fichier televerse via /api/uploads, a partir de
 * son url stockee en base (`/uploads/<nom>`). N'agit que sur ce dossier
 * precis (path.basename() ignore tout segment de chemin fourni) : une url
 * externe (bibliotheque, OpenPlantbook...) n'y correspond jamais et est
 * silencieusement ignoree. Un fichier deja absent (ENOENT) n'est pas une
 * erreur -- la suppression est deja effective.
 */
export async function deleteUploadedFile(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith("/uploads/")) {
    return;
  }
  const filename = path.basename(url);
  const filePath = resolveUploadedFilePath(filename);
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Echec de suppression du fichier uploade", filePath, error);
      return;
    }
  }
  // Le fichier physique n'existe plus (supprime a l'instant, ou deja
  // absent) : la ligne Upload correspondante n'a plus lieu d'etre.
  // deleteMany plutot que delete : silencieux si absente (fichier importe
  // via ZIP, ou televerse avant l'introduction de cette table).
  await db.upload.deleteMany({ where: { filename } }).catch(() => {});
}

/**
 * Comme deleteUploadedFile(), mais verifie d'abord qu'aucune autre ligne ne
 * reference encore cette URL avant de toucher au fichier physique --
 * necessaire depuis qu'assertOwnedUpload() autorise explicitement la
 * reutilisation legitime d'un meme upload entre plusieurs ressources du
 * meme utilisateur (couverture + galerie + note d'une AUTRE plante, par
 * exemple) : sans ce controle, supprimer l'une de ces references effacait
 * le fichier physique alors qu'une autre le referencait encore.
 */
export async function deleteUploadedFileIfUnreferenced(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith("/uploads/")) {
    return;
  }
  const stillReferenced = await db.plant.findFirst({
    where: { OR: [{ photoUrl: url }, { photos: { some: { url } } }, { plantNotes: { some: { photoUrl: url } } }] },
    select: { id: true },
  });
  if (stillReferenced) {
    return;
  }
  await deleteUploadedFile(url);
}

/**
 * Verifie qu'une URL /uploads/... fournie par le client appartient bien a
 * l'utilisateur -- soit parce qu'il l'a lui-meme televersee (table Upload),
 * soit parce qu'elle est deja referencee par une de SES plantes/photos/notes
 * existantes (reedition legitime). Rejette toute autre URL /uploads/... :
 * sans ca, un utilisateur pouvait faire pointer sa plante vers le fichier
 * physique d'un AUTRE compte en devinant/recuperant son nom (UUID). Les
 * URLs hors /uploads/ (bibliotheque, sources externes) ne sont jamais des
 * fichiers geres par cette app et ne sont pas concernees.
 */
export async function assertOwnedUpload(userId: string, url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith("/uploads/")) {
    return;
  }
  const filename = path.basename(url);

  const upload = await db.upload.findUnique({ where: { filename } });
  if (upload?.userId === userId) {
    return;
  }

  const alreadyOwned = await db.plant.findFirst({
    where: {
      userId,
      OR: [{ photoUrl: url }, { photos: { some: { url } } }, { plantNotes: { some: { photoUrl: url } } }],
    },
    select: { id: true },
  });
  if (alreadyOwned) {
    return;
  }

  throw new BadRequestError("Fichier non reconnu.");
}

/**
 * Telecharge une image externe (suggestion de la bibliotheque, source
 * OpenPlantbook/Perenual pre-remplissant le champ photo d'une plante) et la
 * stocke comme un upload possede par userId -- plutot que de laisser l'URL
 * externe hotlinkee indefiniment sur la plante de l'utilisateur : fragile
 * (casse si la source la deplace/supprime) et fuit son IP vers ce tiers a
 * chaque affichage de sa propre plante. Best-effort : retourne l'URL
 * d'origine inchangee en cas d'echec (reseau, format non supporte...),
 * jamais bloquant pour la creation/modification de la ressource.
 */
async function mirrorExternalImageToUpload(url: string, userId: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;

    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim();
    if (!contentType || !ALLOWED_MIRROR_TYPES.has(contentType)) return url;

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_MIRROR_SIZE_BYTES) return url;

    const processed = await sharp(Buffer.from(arrayBuffer))
      .rotate()
      .resize({ width: MAX_MIRROR_DIMENSION, height: MAX_MIRROR_DIMENSION, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: MIRROR_JPEG_QUALITY })
      .toBuffer();

    await mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `${randomUUID()}.jpg`;
    await writeFile(resolveUploadedFilePath(filename), processed);
    try {
      await db.upload.create({ data: { filename, userId } });
    } catch (error) {
      await unlink(resolveUploadedFilePath(filename)).catch(() => {});
      throw error;
    }
    return `/uploads/${filename}`;
  } catch (error) {
    console.error("Echec du mirroring d'image externe, URL externe conservee", url, error);
    return url;
  }
}

/**
 * Normalise une URL de photo fournie par le client avant ecriture en base,
 * a appeler a la place d'assertOwnedUpload() partout ou le champ peut
 * provenir d'une suggestion de bibliotheque (Plant.photoUrl,
 * PlantPhoto.url, Note.photoUrl) :
 * - /uploads/... -> verifie l'ownership (assertOwnedUpload), inchangee.
 * - /library-photos/... -> deja un mirroir public local (voir
 *   libraryPhotos.ts), inchangee, aucune verification necessaire.
 * - URL externe (http/https) -> telechargee et mirroree dans /uploads
 *   (voir mirrorExternalImageToUpload).
 * - null/undefined -> inchangee.
 */
export async function resolvePhotoUrl(userId: string, url: string | null | undefined): Promise<string | null | undefined> {
  if (!url) return url;
  if (url.startsWith("/uploads/")) {
    await assertOwnedUpload(userId, url);
    return url;
  }
  if (url.startsWith("/library-photos/")) {
    return url;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return mirrorExternalImageToUpload(url, userId);
  }
  return url;
}
