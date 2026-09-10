import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedPlant } from "@/server/ownership";
import { addPlantPhotosSchema } from "@/server/validation/plant";

type Params = { params: Promise<{ id: string }> };

/** Ajoute une ou plusieurs photos a la galerie d'une plante (fichiers deja televerses via /api/uploads). */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedPlant(userId, id);

    const body = await request.json();
    const { urls } = addPlantPhotosSchema.parse(body);

    const photos = await db.$transaction(urls.map((url) => db.plantPhoto.create({ data: { plantId: id, url } })));

    return NextResponse.json(photos, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
