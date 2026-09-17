import { getOwnedContainer } from "@/server/ownership";

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
