import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_SIZE_BYTES = 8 * 1024 * 1024;

// Photo de plante affichee au plus en bandeau large (aspect [21/9] sur la
// fiche detail) -- 1600px de large suffit largement, meme sur un ecran
// retina, et evite d'enregistrer une photo de telephone telle quelle
// (souvent 3-4 Mo) alors qu'elle finit affichee dans une vignette de
// quelques dizaines de pixels la plupart du temps.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 82;

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();

    // Protege le CPU (sharp) et le disque (bind-mount /uploads) d'un compte
    // compromis ou d'un script cote client boucle par erreur.
    const { allowed, retryAfterSeconds } = checkRateLimit(`upload:${userId}`, 30, 5 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier envoye." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Format d'image non supporte." }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "Image trop volumineuse (8 Mo max)." }, { status: 400 });
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `${randomUUID()}.jpg`;
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    // .rotate() sans argument : reoriente selon l'EXIF (photos de telephone
    // prises en portrait) puis le supprime -- sans ca certaines photos
    // s'affichent de travers une fois l'orientation EXIF ignoree par le
    // navigateur cote affichage.
    const processed = await sharp(inputBuffer)
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    await writeFile(path.join(UPLOAD_DIR, filename), processed);
    // Trace qui a televerse ce fichier -- necessaire pour verifier
    // l'ownership de l'URL quand elle est fournie ensuite sur une autre
    // route (voir assertOwnedUpload() dans src/server/uploads.ts).
    await db.upload.create({ data: { filename, userId } });

    return NextResponse.json({ url: `/uploads/${filename}` }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
