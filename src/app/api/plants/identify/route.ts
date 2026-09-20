import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError, BadRequestError } from "@/lib/apiError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { identifyPlant, PLANTNET_ORGANS, type PlantnetOrgan } from "@/server/plantnet/client";
import { matchLibraryEntries } from "@/server/plantnet/matching";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_SIZE_BYTES = 8 * 1024 * 1024;
// Pl@ntNet accepte jusqu'a 50 Mo au total, mais aucune raison de lui envoyer
// une photo de telephone brute (3-4 Mo) telle quelle -- meme raisonnement
// que /api/uploads (src/server/uploads.ts).
const MAX_DIMENSION = 1600;
const MAX_INPUT_PIXELS = 40_000_000;

function isPlantnetOrgan(value: unknown): value is PlantnetOrgan {
  return typeof value === "string" && (PLANTNET_ORGANS as readonly string[]).includes(value);
}

/**
 * Identification d'une plante a partir d'une photo (Pl@ntNet). Contrairement
 * a /api/uploads, l'image n'est pas conservee sur disque -- uniquement
 * transmise a Pl@ntNet puis jetee, l'utilisateur choisit separement une
 * photo a conserver pour sa fiche.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();

    // Quota Pl@ntNet gratuit : 500 identifications/jour, partage entre
    // plantes-app et plantes-app-hosted (meme cle API, voir docker-compose.yml).
    // Ce plafond par utilisateur est un garde-fou anti-boucle, pas une
    // tentative de refleter precisement le quota reel.
    const { allowed, retryAfterSeconds } = checkRateLimit(`plant-identify:${userId}`, 10, 15 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const formData = await request.formData();
    const file = formData.get("image");
    const organRaw = formData.get("organ");
    const organ: PlantnetOrgan = isPlantnetOrgan(organRaw) ? organRaw : "auto";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucune image envoyee." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Format d'image non supporte." }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "Image trop volumineuse (8 Mo max)." }, { status: 400 });
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    let processed: Buffer;
    try {
      processed = await sharp(inputBuffer, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      throw new BadRequestError("Image illisible ou dimensions excessives.");
    }

    const candidates = await identifyPlant(processed, "photo.jpg", organ);
    const libraryEntries = await db.plantLibraryEntry.findMany();
    const results = matchLibraryEntries(candidates, libraryEntries);

    return NextResponse.json({ results });
  } catch (error) {
    return handleApiError(error);
  }
}
