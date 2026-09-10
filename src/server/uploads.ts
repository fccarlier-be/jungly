import { unlink } from "node:fs/promises";
import path from "node:path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

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
  const filePath = path.join(UPLOAD_DIR, path.basename(url));
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Echec de suppression du fichier uploade", filePath, error);
    }
  }
}
