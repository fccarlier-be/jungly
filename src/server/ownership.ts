import { db } from "@/server/db";
import { NotFoundError } from "@/lib/apiError";

/**
 * Verifie qu'une plante appartient bien a l'utilisateur courant avant de la
 * renvoyer. Un utilisateur ne doit jamais pouvoir consulter/modifier la
 * plante d'un autre (section 39 du cahier des charges) : on renvoie une 404
 * generique plutot qu'un 403, pour ne pas confirmer l'existence de l'id a
 * un tiers.
 */
export async function getOwnedPlant(userId: string, plantId: string) {
  const plant = await db.plant.findFirst({ where: { id: plantId, userId } });
  if (!plant) {
    throw new NotFoundError("Cette plante n'existe plus.");
  }
  return plant;
}

export async function getOwnedCareRule(userId: string, ruleId: string) {
  const rule = await db.plantCareRule.findFirst({
    where: { id: ruleId, plant: { userId } },
  });
  if (!rule) {
    throw new NotFoundError("Cette règle d'entretien n'existe plus.");
  }
  return rule;
}

export async function getOwnedTask(userId: string, taskId: string) {
  const task = await db.task.findFirst({
    where: { id: taskId, plant: { userId } },
    include: { careRule: true },
  });
  if (!task) {
    throw new NotFoundError("Cette tâche n'existe plus.");
  }
  return task;
}

export async function getOwnedFertilizer(userId: string, fertilizerId: string) {
  const fertilizer = await db.fertilizer.findFirst({ where: { id: fertilizerId, userId } });
  if (!fertilizer) {
    throw new NotFoundError("Cet engrais n'existe plus.");
  }
  return fertilizer;
}

export async function getOwnedLocation(userId: string, locationId: string) {
  const location = await db.location.findFirst({ where: { id: locationId, userId } });
  if (!location) {
    throw new NotFoundError("Cet emplacement n'existe plus.");
  }
  return location;
}

/**
 * plantId est verifie en plus de l'ownership utilisateur : sans lui, un
 * utilisateur pouvait supprimer une photo d'une de ses AUTRES plantes en
 * appelant DELETE /plants/A/photos/photo-de-B (photo-de-B passe la
 * verification userId puisque B lui appartient aussi, mais n'a rien a voir
 * avec la plante A de l'URL).
 */
export async function getOwnedPlantPhoto(userId: string, plantId: string, photoId: string) {
  const photo = await db.plantPhoto.findFirst({ where: { id: photoId, plantId, plant: { userId } } });
  if (!photo) {
    throw new NotFoundError("Cette photo n'existe plus.");
  }
  return photo;
}
