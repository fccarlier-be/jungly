/**
 * Libelle affiche pour un type de regle d'entretien -- partage entre
 * getAllPlantDetails (serveur, cote base de donnees) et PlantDetailView
 * (client) : ce fichier ne doit importer aucun module serveur-only (@/server/*),
 * sans quoi tout ce qui l'importe cote client embarquerait ces dependances
 * dans le bundle navigateur (ex: le client Prisma).
 */
export const RULE_LABEL: Record<string, string> = { WATERING: "Arrosage", FERTILIZING: "Fertilisation", REPOTTING: "Rempotage" };
