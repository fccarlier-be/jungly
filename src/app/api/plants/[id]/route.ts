import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedPlant, getOwnedLocation } from "@/server/ownership";
import { updatePlantSchema } from "@/server/validation/plant";
import { deleteUploadedFileIfUnreferenced, assertOwnedUpload } from "@/server/uploads";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedPlant(userId, id);

    const plant = await db.plant.findUnique({
      where: { id },
      include: {
        location: true,
        careRules: true,
        tasks: { orderBy: { dueAt: "asc" } },
      },
    });

    return NextResponse.json(plant);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedPlant(userId, id);

    const body = await request.json();
    const input = updatePlantSchema.parse(body);

    // Meme verification qu'a la creation : locationId est fourni par le
    // client, ne jamais faire confiance a l'id seul.
    if (input.locationId) {
      await getOwnedLocation(userId, input.locationId);
    }
    await assertOwnedUpload(userId, input.photoUrl);

    const plant = await db.plant.update({ where: { id }, data: input });
    return NextResponse.json(plant);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const plant = await getOwnedPlant(userId, id);

    // Recuperees avant la suppression (cascade) : le seul moment ou ces
    // urls sont encore lisibles depuis les lignes qui les referencent.
    const [photos, notes] = await Promise.all([
      db.plantPhoto.findMany({ where: { plantId: id }, select: { url: true } }),
      db.note.findMany({ where: { plantId: id }, select: { photoUrl: true } }),
    ]);
    const urlsToDelete = new Set(
      [plant.photoUrl, ...photos.map((p) => p.url), ...notes.map((n) => n.photoUrl)].filter(
        (url): url is string => Boolean(url),
      ),
    );

    await db.plant.delete({ where: { id } });
    // La plante (et ses PlantPhoto/Note en cascade) n'existe deja plus a ce
    // stade : la verification "encore reference ailleurs" ne peut donc pas
    // se faire abuser par les propres lignes de la plante supprimee, mais
    // detecte correctement une URL encore utilisee par une AUTRE plante du
    // meme compte (reutilisation legitime, voir assertOwnedUpload()).
    await Promise.all([...urlsToDelete].map((url) => deleteUploadedFileIfUnreferenced(url)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
