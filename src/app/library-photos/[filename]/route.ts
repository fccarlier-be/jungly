import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { resolveLibraryPhotoPath } from "@/server/libraryPhotos";

type Params = { params: Promise<{ filename: string }> };

/**
 * Sert le mirroir local d'une photo de bibliotheque (voir
 * src/server/libraryPhotos.ts). Volontairement PUBLIC, sans verification de
 * session : contrairement a /uploads/[filename] (photo privee d'un
 * utilisateur), ces fichiers sont des photos de reference d'une fiche
 * d'espece PARTAGEE entre tous les comptes -- aucune notion d'ownership ne
 * s'applique. Lecture programmatique du fichier (pas via le dossier public/
 * de Next.js) : le serveur standalone ne detecte pas les fichiers ajoutes a
 * public/ apres son demarrage (meme constat que pour /uploads).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { filename } = await params;
    const data = await readFile(resolveLibraryPhotoPath(filename));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/jpeg",
        // public (pas "private" comme /uploads) : ce fichier est le meme
        // pour tous les visiteurs, un cache partage (CDN, proxy) peut le
        // conserver sans risque de fuite entre comptes.
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Ce fichier n'existe plus." }, { status: 404 });
    }
    console.error("Echec de lecture d'une photo de bibliotheque", error);
    return NextResponse.json({ error: "Une erreur inattendue est survenue." }, { status: 500 });
  }
}
