import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { shareCardQuerySchema } from "@/server/validation/shareCard";
import { loadPhotoDataUrl, loadSharePlant, pickPlantPhoto } from "@/server/shareCard/data";
import { photoBox, renderShareCard } from "@/server/shareCard/render";

type Params = { params: Promise<{ id: string }> };

/**
 * Carte de partage d'une plante (PNG), generee a la demande et jamais
 * stockee : la page de partage l'affiche en apercu puis la transmet telle
 * quelle au menu de partage natif (Web Share API). Reservee au proprietaire
 * -- les photos privees ne quittent l'appli que dans le fichier que
 * l'utilisateur choisit lui-meme d'envoyer.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();

    // Rendu couteux (decodage des photos + satori) : chaque changement
    // d'option de la page de partage en redemande un, d'ou un plafond large
    // mais present.
    const { allowed, retryAfterSeconds } = checkRateLimit(`share-card:${userId}`, 120, 10 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const { id } = await params;
    const query = shareCardQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const plant = await loadSharePlant(userId, id);
    const box = photoBox(query.format, query.mode);
    const content = {
      name: plant.name,
      scientificName: plant.scientificName,
      healthLevel: plant.healthLevel,
      since: plant.since,
      waterings: plant.waterings,
      fertilizings: plant.fertilizings,
      now: new Date(),
    };

    if (query.mode === "single") {
      const url = query.photo ? pickPlantPhoto(plant, query.photo).url : plant.coverUrl;
      return await renderShareCard(query.format, {
        ...content,
        mode: "single",
        photo: await loadPhotoDataUrl(url, box.width, box.height),
      });
    }

    // Toujours dans l'ordre chronologique, quel que soit l'ordre choisi.
    const [before, after] = [pickPlantPhoto(plant, query.before), pickPlantPhoto(plant, query.after)].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const [beforePhoto, afterPhoto] = await Promise.all([
      loadPhotoDataUrl(before.url, box.width, box.height),
      loadPhotoDataUrl(after.url, box.width, box.height),
    ]);
    return await renderShareCard(query.format, {
      ...content,
      mode: "beforeAfter",
      before: { photo: beforePhoto, date: before.createdAt },
      after: { photo: afterPhoto, date: after.createdAt },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
