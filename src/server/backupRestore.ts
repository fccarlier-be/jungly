/**
 * Configuration d'une regle d'entretien restauree depuis une sauvegarde.
 *
 * L'engrais est TOUJOURS resolu par son nom (fertilizerName) parmi ceux du
 * compte qui importe, jamais repris tel quel depuis configuration.fertilizerId :
 * cet id vient du fichier (installation d'origine, ou fichier fabrique a la
 * main) et pouvait designer l'engrais d'un AUTRE compte -- dont le nom et le
 * NPK s'affichaient ensuite sur l'accueil de l'importateur (audit du
 * 2026-09-25). Nom inconnu ou absent : regle sans engrais.
 */
export function restoredRuleConfiguration(
  configuration: Record<string, unknown> | null | undefined,
  fertilizerName: string | null | undefined,
  fertilizerIdByName: Map<string, string>,
): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...(configuration ?? {}) };
  delete rest.fertilizerId;
  const fertilizerId = fertilizerName ? fertilizerIdByName.get(fertilizerName) : undefined;
  return fertilizerId ? { ...rest, fertilizerId } : rest;
}
