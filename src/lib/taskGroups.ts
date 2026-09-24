/** Regroupe les taches d'une meme plante (ordre de la premiere apparition conserve). */
export function groupTasksByPlant<T extends { plantId: string }>(tasks: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const group = groups.get(task.plantId);
    if (group) group.push(task);
    else groups.set(task.plantId, [task]);
  }
  return Array.from(groups.values());
}
