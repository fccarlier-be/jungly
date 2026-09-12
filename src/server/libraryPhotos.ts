import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { assertSafeExternalUrl, fetchWithSizeLimit } from "@/server/externalImageFetch";

const LIBRARY_PHOTOS_DIR = path.join(process.cwd(), "public", "library-photos");
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 82;
// Le decodage a lieu AVANT le resize() ci-dessous -- 1600px de sortie ne
// protege donc pas contre un fichier annoncant des dimensions d'entree
// enormes (audit security1.md, P2). 40 MP est tres au-dela de ce qu'une
// vraie photo de plante peut necessiter, tout en restant nettement sous la
// limite par defaut de Sharp (268 402 689 px).
const MAX_INPUT_PIXELS = 40_000_000;

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
 * Traite (reorientation EXIF, redimensionnement, conversion JPEG) et stocke
 * un buffer d'image deja telecharge, pour une fiche de bibliotheque.
 * Separee de mirrorLibraryImage() pour rester testable independamment du
 * telechargement reseau (voir __tests__/imageMirror.integration.test.ts).
 */
export async function processAndStoreLibraryImage(buffer: Buffer): Promise<string> {
  // .rotate() sans argument : reoriente selon l'EXIF puis le supprime,
  // meme traitement que /api/uploads pour la coherence d'affichage.
  const processed = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  await mkdir(LIBRARY_PHOTOS_DIR, { recursive: true });
  const filename = `${randomUUID()}.jpg`;
  await writeFile(path.join(LIBRARY_PHOTOS_DIR, filename), processed);
  return `/library-photos/${filename}`;
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
 * taille excessive, URL jugee dangereuse...), l'appelant garde alors l'URL
 * externe d'origine plutot que de faire echouer tout l'import/resync pour
 * un probleme tiers passager.
 */
export async function mirrorLibraryImage(url: string): Promise<string | null> {
  try {
    // Verifie AVANT toute requete que l'hote ne resout pas vers le reseau
    // interne (SSRF, voir audit11.md section 1). Import/resync sont reserves
    // a l'admin (source de confiance plus elevee que resolvePhotoUrl cote
    // utilisateur), mais cette URL vient malgre tout d'une reponse HTTP
    // tierce (OpenPlantbook/Perenual) -- defense en profondeur contre une
    // reponse malveillante ou corrompue de ce fournisseur, meme verification
    // qu'ailleurs plutot qu'un cas particulier "source de confiance".
    await assertSafeExternalUrl(url);

    const { buffer, contentType } = await fetchWithSizeLimit(url, MAX_SIZE_BYTES);
    if (!contentType || !ALLOWED_TYPES.has(contentType)) return null;

    return await processAndStoreLibraryImage(buffer);
  } catch (error) {
    console.error("Echec du mirroring d'image de bibliotheque, URL externe conservee", url, error);
    return null;
  }
}
