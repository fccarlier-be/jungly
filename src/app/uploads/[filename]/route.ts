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
      return NextResponse.json(
        { error: "Ce fichier n'existe plus." },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    // Sans Cache-Control explicite, Cloudflare injecte son propre defaut
    // (constate : max-age=14400) et met ce 404 en cache d'edge -- alors que
    // l'etat d'autorisation d'une URL /uploads/... change dans le temps
    // (aperçu avant sauvegarde du formulaire -> pas encore attachee a une
    // plante -> 404 legitime a cet instant ; une fois la plante sauvegardee,
    // la meme URL devient legitimement accessible, mais le 404 perime reste
    // servi depuis le cache jusqu'a expiration, verifie en direct sur
    // plantes.fcold.org : security2.md). no-store ici seulement (pas dans
    // handleApiError globalement) : ne doit pas changer la politique de
    // cache des autres routes API, qui n'ont pas cette meme propriete
    // d'etat changeant.
    const response = handleApiError(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
