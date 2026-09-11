/**
 * Script de rattrapage ponctuel (pas execute au demarrage du conteneur) :
 * recalcule le titre des taches WATERING/FERTILIZING/REPOTTING existantes
 * avec `buildTaskTitle()`.
 *
 * Avant ce correctif, le titre etait fige a la creation de la tache sous la
 * forme "Arrosage - <nom de la plante au moment de la creation>" -- deja
 * redondant avec le nom affiche juste a cote (voir TaskCard/UpcomingTaskCard),
 * et jamais resynchronise si la plante etait renommee ensuite (ex. pour
 * corriger une faute de frappe/un accent manquant). Ce script ne fait aucune
 * lecture du nom de la plante : il remplace simplement chaque titre par la
 * forme canonique ("Arrosage", "Fertilisation", "Rempotage"), quel que soit
 * le statut de la tache (PENDING/COMPLETED/SNOOZED/SKIPPED), pour que
 * l'historique aussi cesse d'afficher l'ancien nom fige.
 *
 * A relancer manuellement si besoin (`npx tsx prisma/backfillTaskTitles.ts`) --
 * idempotent, sans effet sur les titres deja au format canonique.
 */
import { CareRuleType } from "@generated/prisma/client";
import { buildTaskTitle } from "../src/server/careEngine/taskGenerator";
import { db } from "../src/server/db";

// Les seuls types de tache generes via buildTaskTitle() (voir service.ts) --
// PRUNING/INSPECTION/OTHER (TaskType) n'ont jamais ete construits avec ce
// gabarit, rien a corriger pour eux.
const TARGET_TYPES: CareRuleType[] = ["WATERING", "FERTILIZING", "REPOTTING"];

async function main() {
  let updated = 0;
  for (const type of TARGET_TYPES) {
    const correctTitle = buildTaskTitle(type);
    const result = await db.task.updateMany({
      where: { type, title: { not: correctTitle } },
      data: { title: correctTitle },
    });
    console.log(`${type} : ${result.count} tâche(s) mise(s) à jour vers "${correctTitle}".`);
    updated += result.count;
  }
  console.log(`Terminé : ${updated} tâche(s) au total.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
