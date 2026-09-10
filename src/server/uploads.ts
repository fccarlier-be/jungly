import { unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/server/db";
import { BadRequestError } from "@/lib/apiError";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

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
  const filePath = resolveUploadedFilePath(url);
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Echec de suppression du fichier uploade", filePath, error);
    }
  }
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
