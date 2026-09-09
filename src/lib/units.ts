/** Formatage d'affichage uniquement — les valeurs restent stockees en unites standard (ml, mm) en base (section 25). */

export function formatVolume(quantityMl: number | null | undefined): string {
  if (quantityMl == null) return "-";
  if (quantityMl >= 1000) {
    return `${(quantityMl / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} L`;
  }
  return `${quantityMl.toLocaleString("fr-FR")} ml`;
}

export function formatDistanceMm(mm: number | null | undefined): string {
  if (mm == null) return "-";
  if (mm >= 10) {
    return `${(mm / 10).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} cm`;
  }
  return `${mm} mm`;
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
