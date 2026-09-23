/**
 * Determine quelles photos demander a l'utilisateur pour un diagnostic, et
 * si le resultat vaut la peine d'appeler l'API Pl@ntNet "diseases/identify"
 * (quota partage, limite -- voir plantnet/quota.ts).
 */
import type { PhotoRequest, SymptomCategory, SymptomVector } from "@/server/diagnosis/types";

// Meme limite dure que PLANTNET_MAX_IMAGES (plantnet/client.ts) : au-dela,
// l'API rejette la requete. Redeclaree ici plutot qu'importee pour ne pas
// coupler ce module purement metier au client HTTP Pl@ntNet -- si la limite
// change un jour cote API, les deux constantes doivent etre mises a jour
// ensemble (voir aussi le test qui les compare).
const MAX_PHOTOS = 5;

const GENERAL_PHOTO: PhotoRequest = {
  id: "general",
  label: "Vue générale de la plante",
  organ: "auto",
  required: true,
};

// Gros plan de la zone atteinte, feuille jaunie ou brunie -- meme cle
// d'organe pour les deux, Pl@ntNet ne distingue pas plus finement qu'une
// feuille.
const AFFECTED_LEAF_CLOSEUP: PhotoRequest = {
  id: "affectedLeafCloseup",
  label: "Gros plan de la zone atteinte (feuille)",
  organ: "leaf",
  required: true,
};

// Dessous de la feuille : Pl@ntNet ne distingue pas dessus/dessous (meme
// organe "leaf" cote API), mais c'est utile pour l'utilisateur et pour le
// moteur de regles local (ex. parasites souvent caches dessous) -- donc pas
// requis, en complement seulement.
const LEAF_UNDERSIDE: PhotoRequest = {
  id: "leafUnderside",
  label: "Dessous de la feuille",
  organ: "leaf",
  required: false,
};

const PEST_CLOSEUP: PhotoRequest = {
  id: "pestCloseup",
  label: "Gros plan très rapproché des parasites ou des traces",
  organ: "leaf",
  required: true,
};

const FLOWER_CLOSEUP: PhotoRequest = {
  id: "flowerCloseup",
  label: "Gros plan de la fleur ou du bouton",
  organ: "flower",
  required: true,
};

// Photos supplementaires par categorie, au-dela de la vue generale
// systematique. ABNORMAL_GROWTH, DROPPING_LEAVES, WILTING et OTHER ne sont
// volontairement pas dans cette table (tableau vide implicite) : ce sont
// des symptomes d'ensemble de la plante (silhouette, chute, flechissement)
// qu'un gros plan supplementaire n'aide pas vraiment a documenter -- la vue
// generale suffit, inutile de demander plus de photos a l'utilisateur.
const EXTRA_PHOTOS_BY_CATEGORY: Partial<Record<SymptomCategory, PhotoRequest[]>> = {
  YELLOW_LEAVES: [AFFECTED_LEAF_CLOSEUP, LEAF_UNDERSIDE],
  BROWN_LEAVES: [AFFECTED_LEAF_CLOSEUP, LEAF_UNDERSIDE],
  SPOTS: [AFFECTED_LEAF_CLOSEUP, LEAF_UNDERSIDE],
  PESTS: [PEST_CLOSEUP, LEAF_UNDERSIDE],
  FLOWERING_ISSUE: [FLOWER_CLOSEUP],
};

export function getRequestedPhotos(vector: SymptomVector): PhotoRequest[] {
  const extra = EXTRA_PHOTOS_BY_CATEGORY[vector.category] ?? [];
  const photos = [GENERAL_PHOTO, ...extra];
  // Garde-fou : la limite Pl@ntNet est une contrainte externe verifiee, pas
  // une simple preference -- si une categorie depassait un jour 5 photos,
  // mieux vaut le detecter ici que de le decouvrir a l'appel API.
  return photos.slice(0, MAX_PHOTOS);
}

// Filtre volontaire pour economiser le quota Pl@ntNet "diseases/identify"
// (partage avec "identify", limite quotidienne -- voir plantnet/quota.ts) :
// on ne l'appelle que pour les categories ou une pathologie visuelle a
// reellement du sens a identifier par photo. YELLOW_LEAVES/BROWN_LEAVES/
// SPOTS/PESTS peuvent correspondre a une maladie ou un nuisible reconnaissable
// visuellement. ABNORMAL_GROWTH, FLOWERING_ISSUE et OTHER sont le plus
// souvent des problemes de conduite de culture (lumiere, engrais...) sans
// signature visuelle de maladie. WILTING et DROPPING_LEAVES sont eux aussi
// le plus souvent des problemes d'arrosage (exces ou manque), pas des
// maladies identifiables par une photo de feuille malade.
const DISEASE_ID_CATEGORIES = new Set<SymptomCategory>(["YELLOW_LEAVES", "BROWN_LEAVES", "SPOTS", "PESTS"]);

export function shouldCallDiseaseId(category: SymptomCategory): boolean {
  return DISEASE_ID_CATEGORIES.has(category);
}
