import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

const LIBRARY_PHOTOS_DIR = path.join(process.cwd(), "public", "library-photos");
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 82;

/**
 * Chemin disque d'un fichier de bibliotheque a partir de son seul nom --
 * path.basename() empeche toute traversee de repertoire. Lu par une route
 * dediee (src/app/library-photos/[filename]/route.ts) plutot que servi par
 * le dossier public/ de Next.js : le serveur standalone ne detecte pas les
 * fichiers ajoutes a public/ apres son demarrage (meme constat que pour
 * /uploads, voir resolveUploadedFilePath dans uploads.ts).
 */
export function resolveLibraryPhotoPath(filename: string): string {
  return path.join(LIBRARY_PHOTOS_DIR, path.basename(filename));
}

/**
 * Mirroir local d'une photo de reference externe (OpenPlantbook/Perenual)
 * pour une fiche de bibliotheque PARTAGEE (PlantLibraryEntry). Contrairement
 * a /uploads/ (prive, verifie par ownership dans uploads.ts), ces fichiers
 * sont publics -- une fiche d'espece n'appartient a aucun utilisateur en
 * particulier, et l'image (deja filtree sur une licence ouverte cote
 * iNaturalist/GBIF) n'a pas besoin d'etre protegee par une session. Sans ce
 * mirroir, chaque affichage de /bibliotheque re-televersait la photo depuis
 * l'hote externe a chaque chargement -- fragile (casse si la source la
 * deplace/supprime) et fuit l'IP du visiteur vers ce tiers a chaque page vue.
 *
 * Best-effort : retourne null en cas d'echec (reseau, format non supporte,
 * taille excessive...), l'appelant garde alors l'URL externe d'origine
 * plutot que de faire echouer tout l'import/resync pour un probleme tiers
 * passager.
 */
export async function mirrorLibraryImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim();
    if (!contentType || !ALLOWED_TYPES.has(contentType)) return null;

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_SIZE_BYTES) return null;

    // .rotate() sans argument : reoriente selon l'EXIF puis le supprime,
    // meme traitement que /api/uploads pour la coherence d'affichage.
    const processed = await sharp(Buffer.from(arrayBuffer))
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    await mkdir(LIBRARY_PHOTOS_DIR, { recursive: true });
    const filename = `${randomUUID()}.jpg`;
    await writeFile(path.join(LIBRARY_PHOTOS_DIR, filename), processed);
    return `/library-photos/${filename}`;
  } catch (error) {
    console.error("Echec du mirroring d'image de bibliotheque, URL externe conservee", url, error);
    return null;
  }
}
