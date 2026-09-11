/** Formatage/saisie — les valeurs restent stockees en unites standard (ml, mm) en base ; ce module convertit uniquement pour l'affichage et la saisie selon la preference `User.unitSystem` (utile notamment pour un futur public anglophone/imperial). */

export type UnitSystem = "METRIC" | "IMPERIAL";

const ML_PER_FL_OZ = 29.5735;
const ML_PER_GALLON = 3785.41;
const MM_PER_INCH = 25.4;

export function formatVolume(quantityMl: number | null | undefined, unitSystem: UnitSystem = "METRIC"): string {
  if (quantityMl == null) return "-";

  if (unitSystem === "IMPERIAL") {
    if (quantityMl >= ML_PER_GALLON) {
      return `${(quantityMl / ML_PER_GALLON).toLocaleString("en-US", { maximumFractionDigits: 2 })} gal`;
    }
    return `${(quantityMl / ML_PER_FL_OZ).toLocaleString("en-US", { maximumFractionDigits: 1 })} fl oz`;
  }

  if (quantityMl >= 1000) {
    return `${(quantityMl / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} L`;
  }
  return `${quantityMl.toLocaleString("fr-FR")} ml`;
}

export function formatDistanceMm(mm: number | null | undefined, unitSystem: UnitSystem = "METRIC"): string {
  if (mm == null) return "-";

  if (unitSystem === "IMPERIAL") {
    return `${(mm / MM_PER_INCH).toLocaleString("en-US", { maximumFractionDigits: 1 })} in`;
  }

  if (mm >= 10) {
    return `${(mm / 10).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} cm`;
  }
  return `${mm} mm`;
}

/** Convertit une distance en mm vers la valeur a afficher/editer dans un champ de saisie (mm si metrique, pouces si imperial). */
export function mmToInputUnit(mm: number, unitSystem: UnitSystem): number {
  return unitSystem === "IMPERIAL" ? Math.round((mm / MM_PER_INCH) * 10) / 10 : mm;
}

/** Inverse de mmToInputUnit : convertit la valeur saisie par l'utilisateur (mm ou pouces selon unitSystem) vers des mm pour le stockage. */
export function inputUnitToMm(value: number, unitSystem: UnitSystem): number {
  return unitSystem === "IMPERIAL" ? Math.round(value * MM_PER_INCH) : Math.round(value);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatRelativeDueDate(dueAt: Date | string): string {
  const due = new Date(dueAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);

  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Demain";
  if (diffDays > 1 && diffDays <= 27) return `Dans ${diffDays} jours`;
  if (diffDays > 27 && diffDays <= 60) return `Dans ${Math.round(diffDays / 30)} mois`;
  if (diffDays > 60) return `Dans ${Math.round(diffDays / 30)} mois`;
  if (diffDays === -1) return "En retard d'1 jour";
  return `En retard de ${Math.abs(diffDays)} jours`;
}
