/**
 * Calcule la quantité d'engrais (dans l'unité du dosage, ex. ml) à utiliser
 * pour un volume d'eau donné (en litres), à partir d'un dosage exprimé par
 * litre. Arrondi à 1 décimale pour rester lisible à l'utilisateur.
 */
export function computeFertilizerAmount(dosagePerLiter: number, volumeLiters: number): number {
  if (dosagePerLiter <= 0) {
    throw new Error("Le dosage doit être supérieur à 0.");
  }
  if (volumeLiters <= 0) {
    throw new Error("Le volume d'eau doit être supérieur à 0.");
  }
  return Math.round(dosagePerLiter * volumeLiters * 10) / 10;
}
