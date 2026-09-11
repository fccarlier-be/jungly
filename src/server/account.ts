import { db } from "@/server/db";
import { deleteUploadedFileIfUnreferenced } from "@/server/uploads";

/**
 * Supprime definitivement un compte et toutes ses donnees -- exigence Google
 * Play (une app qui permet la creation de compte doit permettre sa
 * suppression en self-service). Le schema Prisma cascade deja depuis User
 * vers toutes les tables liees (Plant, PlantCareRule, Task, CareEvent, Note,
 * PlantPhoto, Sensor, SensorReading, Fertilizer, NotificationPreference,
 * PushSubscription, WeatherProfile, Location, Upload) : seuls les fichiers
 * physiques sur disque ne suivent jamais un cascade DB et doivent etre geres
 * a la main, comme pour la suppression d'une plante (voir
 * DELETE /api/plants/[id]).
 */
export async function deleteAccount(userId: string): Promise<void> {
  // Recuperees avant la suppression (cascade) : le seul moment ou ces urls
  // sont encore lisibles depuis les lignes qui les referencent.
  const [plants, uploads] = await Promise.all([
    db.plant.findMany({
      where: { userId },
      select: {
        photoUrl: true,
        photos: { select: { url: true } },
        plantNotes: { select: { photoUrl: true } },
      },
    }),
    db.upload.findMany({ where: { userId }, select: { filename: true } }),
  ]);

  const urlsToDelete = new Set<string>();
  for (const plant of plants) {
    if (plant.photoUrl) urlsToDelete.add(plant.photoUrl);
    for (const photo of plant.photos) urlsToDelete.add(photo.url);
    for (const note of plant.plantNotes) {
      if (note.photoUrl) urlsToDelete.add(note.photoUrl);
    }
  }
  // Fichiers televerses mais jamais attaches a une plante/note (upload
  // abandonne en cours de formulaire, par exemple) : sans ligne Plant/Note
  // pour les referencer, ils ne remonteraient jamais via la boucle ci-dessus.
  for (const upload of uploads) {
    urlsToDelete.add(`/uploads/${upload.filename}`);
  }

  await db.user.delete({ where: { id: userId } });

  // Le compte (et donc toute possibilite de reference legitime a ces
  // fichiers) n'existe deja plus a ce stade -- deleteUploadedFileIfUnreferenced
  // reste utilisee par coherence avec le reste du code, mais ne peut plus
  // trouver de reference restante.
  await Promise.all([...urlsToDelete].map((url) => deleteUploadedFileIfUnreferenced(url)));
}
