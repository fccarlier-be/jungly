import { describe, expect, it } from "vitest";
import { shouldTriggerFromMoistureReading } from "@/server/careEngine/sensorTrigger";

describe("shouldTriggerFromMoistureReading", () => {
  const rule = { recurrenceType: "MOISTURE_THRESHOLD", configuration: { moistureThresholdPercent: 30 } };

  it("declenche quand l'humidite passe sous le seuil", () => {
    expect(shouldTriggerFromMoistureReading("SOIL_MOISTURE", 25, rule)).toBe(true);
  });

  it("declenche pile au seuil (<=)", () => {
    expect(shouldTriggerFromMoistureReading("SOIL_MOISTURE", 30, rule)).toBe(true);
  });

  it("ne declenche pas au-dessus du seuil", () => {
    expect(shouldTriggerFromMoistureReading("SOIL_MOISTURE", 45, rule)).toBe(false);
  });

  it("ignore un capteur d'un autre type", () => {
    expect(shouldTriggerFromMoistureReading("TEMPERATURE", 10, rule)).toBe(false);
  });

  it("ignore une regle qui n'est pas MOISTURE_THRESHOLD", () => {
    expect(shouldTriggerFromMoistureReading("SOIL_MOISTURE", 10, { recurrenceType: "FIXED_INTERVAL_DAYS" })).toBe(false);
  });

  it("ignore une regle MOISTURE_THRESHOLD sans seuil configure", () => {
    expect(shouldTriggerFromMoistureReading("SOIL_MOISTURE", 10, { recurrenceType: "MOISTURE_THRESHOLD" })).toBe(false);
  });
});
