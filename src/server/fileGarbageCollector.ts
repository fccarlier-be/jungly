import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/server/db";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const LIBRARY_PHOTOS_DIR = path.join(process.cwd(), "public", "library-photos");

// La DB et le filesystem ne forment pas une transaction (SQLite + fichiers
// separes) : un crash entre les deux etapes d'une ecriture peut laisser un
// fichier physique sans ligne DB correspondante, ou l'inverse (voir
// audit15.md, #4). Ce delai de grace evite que ce nettoyage ne supprime un
// fichier tout juste ecrit dont la ligne DB n'a pas encore ete commitee
// (ex. entre writeFile() et db.upload.create() dans processAndStoreUpload) :
// on ne touche jamais a un fichier modifie il y a moins de 24h.
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

async function listFiles(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function isOldEnough(filePath: string, now: number): Promise<boolean> {
  const stats = await stat(filePath);
  return now - stats.mtimeMs > GRACE_PERIOD_MS;
}

async function deleteOrphan(filePath: string, filename: string, kind: string): Promise<boolean> {
  try {
    await unlink(filePath);
    console.log(`[gc] fichier orphelin supprime (${kind}) : ${filename}`);
    return true;
  } catch (error) {
    console.error(`[gc] echec de suppression du fichier orphelin (${kind}) : ${filename}`, error);
    return false;
  }
}

/**
 * Supprime les fichiers de /uploads sans plus aucune reference -- ni ligne
 * Upload, ni Plant.photoUrl/PlantPhoto.url/Note.photoUrl (un fichier
 * restaure via import ZIP n'a par exemple jamais de ligne Upload, voir
 * uploads.ts). deleteUploadedFileIfUnreferenced() couvre deja le cas normal
 * (suppression explicite d'une ressource), ce GC couvre le residu -- un
 * crash serveur entre la creation du fichier et son enregistrement DB, ou
 * tout autre etat incoherent qui aurait echappe au chemin normal.
 */
async function collectOrphanUploads(now: number): Promise<number> {
  const files = await listFiles(UPLOAD_DIR);
  if (files.length === 0) return 0;

  const [uploadRows, plants, notes] = await Promise.all([
    db.upload.findMany({ select: { filename: true } }),
    db.plant.findMany({ select: { photoUrl: true, photos: { select: { url: true } } } }),
    db.note.findMany({ select: { photoUrl: true } }),
  ]);

  const referenced = new Set<string>();
  for (const row of uploadRows) referenced.add(row.filename);
  for (const plant of plants) {
    if (plant.photoUrl) referenced.add(path.basename(plant.photoUrl));
    for (const photo of plant.photos) referenced.add(path.basename(photo.url));
  }
  for (const note of notes) {
    if (note.photoUrl) referenced.add(path.basename(note.photoUrl));
  }

  let deleted = 0;
  for (const filename of files) {
    if (referenced.has(filename)) continue;
    const filePath = path.join(UPLOAD_DIR, filename);
    if (!(await isOldEnough(filePath, now))) continue;
    if (await deleteOrphan(filePath, filename, "uploads")) deleted += 1;
  }
  return deleted;
}

/**
 * Meme principe que collectOrphanUploads(), pour /library-photos -- pas de
 * table dediee ici, la seule source de verite est
 * PlantLibraryEntry.careProfile.imageUrl.
 */
async function collectOrphanLibraryPhotos(now: number): Promise<number> {
  const files = await listFiles(LIBRARY_PHOTOS_DIR);
  if (files.length === 0) return 0;

  const entries = await db.plantLibraryEntry.findMany({ select: { careProfile: true } });
  const referenced = new Set<string>();
  for (const entry of entries) {
    const imageUrl = (entry.careProfile as { imageUrl?: string } | null)?.imageUrl;
    if (imageUrl?.startsWith("/library-photos/")) {
      referenced.add(path.basename(imageUrl));
    }
  }

  let deleted = 0;
  for (const filename of files) {
    if (referenced.has(filename)) continue;
    const filePath = path.join(LIBRARY_PHOTOS_DIR, filename);
    if (!(await isOldEnough(filePath, now))) continue;
    if (await deleteOrphan(filePath, filename, "library-photos")) deleted += 1;
  }
  return deleted;
}

/** Reconciliation DB <-> filesystem, a executer periodiquement (voir scheduler.ts). */
export async function collectOrphanFiles(now: number = Date.now()): Promise<{ uploads: number; libraryPhotos: number }> {
  const [uploads, libraryPhotos] = await Promise.all([collectOrphanUploads(now), collectOrphanLibraryPhotos(now)]);
  if (uploads > 0 || libraryPhotos > 0) {
    console.log(`[gc] termine : ${uploads} fichier(s) uploads supprime(s), ${libraryPhotos} fichier(s) library-photos supprime(s).`);
  }
  return { uploads, libraryPhotos };
}
