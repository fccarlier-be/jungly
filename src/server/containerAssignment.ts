import { db } from "@/server/db";
import { getOwnedContainer } from "@/server/ownership";
import { normalizeWateringIntervalDays, type CompatibilityPlant } from "@/lib/containerCompatibility";

interface ContainerAssignmentInput {
  containerId?: string | null;
  positionX?: number | null;
  positionY?: number | null;
}

/**
 * Verifie l'ownership de containerId s'il est fourni, et centre la position
 * par defaut (0.5, 0.5) si absente -- cas de l'assignation depuis le menu
 * deroulant de la fiche plante (le schema/glisser-deposer, phase 2, fournit
 * toujours une position explicite). Detacher (containerId: null) efface
 * aussi la position, sans signification hors d'un contenant.
 *
 * Retourne un objet vide si containerId est absent du payload (cle omise) :
 * partagee entre POST /api/plants et PATCH /api/plants/:id, ou une mise a
 * jour partielle ne doit jamais toucher au rattachement si le client n'a
 * rien envoye a ce sujet.
 */
export async function resolveContainerFields(userId: string, input: ContainerAssignmentInput) {
  if (input.containerId === undefined) {
    return {};
  }
  if (input.containerId === null) {
    return { containerId: null, positionX: null, positionY: null };
  }

  await getOwnedContainer(userId, input.containerId);
  return {
    containerId: input.containerId,
    positionX: input.positionX ?? 0.5,
    positionY: input.positionY ?? 0.5,
  };
}

export interface ContainerOptionForUser {
  id: string;
  name: string;
  occupants: CompatibilityPlant[];
}

/**
 * Jardinieres de l'utilisateur avec leurs occupants actuels (substrat,
 * arrosage normalise) -- utilise par le formulaire plante pour calculer les
 * avertissements de compatibilite en direct, sans aller-retour reseau
 * supplementaire (voir src/lib/containerCompatibility.ts).
 */
export async function listContainerOptionsForUser(userId: string): Promise<ContainerOptionForUser[]> {
  const containers = await db.container.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    include: {
      plants: {
        select: {
          id: true,
          name: true,
          substrateType: true,
          careRules: { where: { type: "WATERING", enabled: true }, take: 1 },
        },
      },
    },
  });

  return containers.map((c) => ({
    id: c.id,
    name: c.name,
    occupants: c.plants.map((p) => ({
      id: p.id,
      name: p.name,
      substrateType: p.substrateType,
      wateringIntervalDays: normalizeWateringIntervalDays(p.careRules[0]),
    })),
  }));
}
