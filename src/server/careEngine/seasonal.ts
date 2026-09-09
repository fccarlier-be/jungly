export interface SeasonalWindow {
  /** Mois de début de la période active, 1-12 (inclus). */
  activeFromMonth?: number | null;
  /** Mois de fin de la période active, 1-12 (inclus). Peut être < activeFromMonth (période à cheval sur l'année). */
  activeUntilMonth?: number | null;
}

/**
 * Indique si une règle saisonnière est active pour un mois donné (1-12).
 * Sans fenêtre définie, la règle est considérée active toute l'année.
 */
export function isMonthActive(window: SeasonalWindow, month: number): boolean {
  const { activeFromMonth, activeUntilMonth } = window;
  if (activeFromMonth == null || activeUntilMonth == null) {
    return true;
  }
  if (activeFromMonth <= activeUntilMonth) {
    return month >= activeFromMonth && month <= activeUntilMonth;
  }
  // Fenêtre à cheval sur le nouvel an, ex. octobre -> février.
  return month >= activeFromMonth || month <= activeUntilMonth;
}

/**
 * Si la date calculée tombe hors saison, la repousse au premier jour du
 * prochain mois actif (année courante ou suivante).
 */
export function pushToNextActiveWindow(date: Date, window: SeasonalWindow): Date {
  if (isMonthActive(window, date.getMonth() + 1)) {
    return date;
  }
  const { activeFromMonth } = window;
  if (activeFromMonth == null) {
    return date;
  }
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  if (result.getMonth() + 1 <= activeFromMonth) {
    result.setMonth(activeFromMonth - 1);
  } else {
    result.setFullYear(result.getFullYear() + 1);
    result.setMonth(activeFromMonth - 1);
  }
  return result;
}
