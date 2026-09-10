import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedPlant, getOwnedPlantPhoto } from "@/server/ownership";

type Params = { params: Promise<{ id: string; photoId: string }> };

/**
 * Supprime une photo de la galerie. Si c'etait la photo de couverture, une
 * autre photo restante de la galerie est promue automatiquement (sinon la
 * couverture se retrouverait a pointer vers un fichier qui n'existe plus
 * dans aucune liste) ; a defaut, la couverture est simplement effacee.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id, photoId } = await params;
    const plant = await getOwnedPlant(userId, id);
    const photo = await getOwnedPlantPhoto(userId, photoId);

    await db.plantPhoto.delete({ where: { id: photo.id } });

    if (plant.photoUrl === photo.url) {
      const fallback = await db.plantPhoto.findFirst({
        where: { plantId: id, id: { not: photo.id } },
        orderBy: { createdAt: "asc" },
      });
      await db.plant.update({ where: { id }, data: { photoUrl: fallback?.url ?? null } });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
