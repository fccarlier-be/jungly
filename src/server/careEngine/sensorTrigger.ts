/**
 * Permet au moteur d'entretien de passer de "arroser tous les 7 jours" à
 * "arroser quand l'humidité du sol passe sous un seuil", sans réécrire le
 * reste de l'application. Cette fonction est le seul endroit qui décide si
 * une lecture de capteur doit déclencher une tâche -- le reste (création de
 * la tâche) reste géré par le CareEngine existant (service.ts).
 */

export interface MoistureRuleConfig {
  moistureThresholdPercent?: number;
}

export interface MoistureTriggerRule {
  recurrenceType: string;
  configuration?: MoistureRuleConfig | null;
}

export function shouldTriggerFromMoistureReading(sensorType: string, readingValue: number, rule: MoistureTriggerRule): boolean {
  if (sensorType !== "SOIL_MOISTURE" || rule.recurrenceType !== "MOISTURE_THRESHOLD") {
    return false;
  }
  const threshold = rule.configuration?.moistureThresholdPercent;
  if (threshold == null) {
    return false;
  }
  return readingValue <= threshold;
}
