import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedPlant } from "@/server/ownership";
import { addPlantPhotosSchema } from "@/server/validation/plant";
import { resolvePhotoUrl } from "@/server/uploads";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

/** Ajoute une ou plusieurs photos a la galerie d'une plante (fichiers deja televerses via /api/uploads). */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();

    // Quota de ressources par compte (audit security1.md, P2) : chaque
    // appel peut deja creer plusieurs PlantPhoto (urls est un tableau).
    const { allowed, retryAfterSeconds } = checkRateLimit(`plant-photo:${userId}`, 100, 60 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const { id } = await params;
    await getOwnedPlant(userId, id);

    const body = await request.json();
    const { urls } = addPlantPhotosSchema.parse(body);
    const resolvedUrls = await Promise.all(urls.map((url) => resolvePhotoUrl(userId, url)));

    const photos = await db.$transaction(
      resolvedUrls.map((url) => db.plantPhoto.create({ data: { plantId: id, url: url! } })),
    );

    return NextResponse.json(photos, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
