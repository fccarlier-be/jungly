/**
 * Deduit un multiplicateur d'intervalle d'arrosage a partir de temperatures
 * maximales journalieres recentes (voir fetchRecentMaxTemperatures). < 1 =
 * arrosages plus frequents (intervalle reduit), > 1 = moins frequents.
 * Base sur la moyenne plutot qu'un seul jour, pour ne pas sur-ajuster a un
 * pic isole d'une seule journee.
 */
export function computeWateringMultiplier(dailyMaxTemps: number[]): number {
  if (dailyMaxTemps.length === 0) return 1;

  const average = dailyMaxTemps.reduce((sum, t) => sum + t, 0) / dailyMaxTemps.length;

  if (average > 30) return 0.7; // canicule : ~30% plus frequent
  if (average > 25) return 0.85;
  if (average >= 15) return 1; // plage normale
  return 1.3; // frais : arrosages espaces
}

/** Libelle court (badge compact, ex. page d'accueil). */
export function multiplierShortLabel(multiplier: number): string {
  if (multiplier <= 0.75) return "Canicule";
  if (multiplier < 1) return "Chaleur";
  if (multiplier === 1) return "Normal";
  return "Frais";
}

/** Libelle complet, une phrase (ex. Parametres). */
export function multiplierLabel(multiplier: number): string {
  if (multiplier <= 0.75) return "Canicule : arrosages nettement plus fréquents en ce moment.";
  if (multiplier < 1) return "Chaleur : arrosages un peu plus fréquents en ce moment.";
  if (multiplier === 1) return "Températures normales : aucun ajustement en ce moment.";
  return "Frais : arrosages un peu plus espacés en ce moment.";
}
