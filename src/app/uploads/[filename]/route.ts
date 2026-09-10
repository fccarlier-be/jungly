import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { requireUserId } from "@/lib/session";
import { handleApiError, NotFoundError } from "@/lib/apiError";
import { db } from "@/server/db";
import { resolveUploadedFilePath } from "@/server/uploads";

type Params = { params: Promise<{ filename: string }> };

/**
 * Sert un fichier de /uploads (photo de couverture, galerie, ou photo de
 * note) apres verification qu'il appartient bien a une plante de
 * l'utilisateur connecte. Route volontairement hors de `/api/` : meme
 * chemin d'URL que l'ancien service statique par nginx (`/uploads/<nom>`),
 * pour ne modifier aucune reference existante dans le code (photoUrl,
 * PlantPhoto.url, Note.photoUrl utilises tels quels partout ailleurs).
 *
 * Lecture programmatique du fichier (pas via le dossier `public/` de
 * Next.js) : ne reintroduit donc pas le bug qui avait initialement motive
 * le service direct par nginx (Next standalone ne detectait pas les
 * fichiers ajoutes a `public/` apres son demarrage -- specifique au
 * service STATIQUE de `public/`, pas a une lecture disque dans un route
 * handler).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { filename } = await params;
    const url = `/uploads/${filename}`;

    const owned = await db.plant.findFirst({
      where: {
        userId,
        OR: [{ photoUrl: url }, { photos: { some: { url } } }, { plantNotes: { some: { photoUrl: url } } }],
      },
      select: { id: true },
    });
    if (!owned) {
      throw new NotFoundError("Ce fichier n'existe plus.");
    }

    const data = await readFile(resolveUploadedFilePath(filename));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Ce fichier n'existe plus." }, { status: 404 });
    }
    return handleApiError(error);
  }
}
