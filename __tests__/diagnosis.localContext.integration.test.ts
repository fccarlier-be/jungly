import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { buildLocalContext } from "@/server/diagnosis/localContext";

/**
 * Test d'integration (vraie base SQLite) plutot qu'un test de fonction
 * pure : buildLocalContext() croise plusieurs tables (Plant, PlantCareRule,
 * CareEvent, WeatherProfile, PlantLibraryEntry) via de vraies requetes
 * Prisma -- le meme raisonnement que dueTasks.integration.test.ts.
 */
describe("buildLocalContext (integration reelle SQLite)", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await db.user.create({ data: { email: `test-local-context-${Date.now()}@example.com`, passwordHash: "x" } });
    userId = user.id;
  });

  afterAll(async () => {
    // Cascade Prisma (Plant.user, PlantCareRule.plant, CareEvent.plant,
    // WeatherProfile.user onDelete: Cascade) nettoie tout le reste.
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it("detecte un retard d'arrosage par rapport a la regle theorique", async () => {
    const plant = await db.plant.create({ data: { userId, name: "Retard arrosage" } });
    await db.plantCareRule.create({
      data: { plantId: plant.id, type: "WATERING", recurrenceType: "FIXED_INTERVAL_DAYS", interval: 3 },
    });
    await db.careEvent.create({
      data: { plantId: plant.id, type: "WATERING", performedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    });

    const context = await buildLocalContext(plant.id);

    expect(context.wateringRuleIntervalDays).toBe(3);
    expect(context.daysSinceLastWatering).toBe(10);
    // Prochaine echeance theorique = J+3, aujourd'hui = J+10 -> 7 jours de retard.
    expect(context.wateringGapDays).toBe(7);

    await db.plant.delete({ where: { id: plant.id } });
  });

  it("ne signale aucun retard quand l'arrosage est a jour", async () => {
    const plant = await db.plant.create({ data: { userId, name: "A jour" } });
    await db.plantCareRule.create({
      data: { plantId: plant.id, type: "WATERING", recurrenceType: "FIXED_INTERVAL_DAYS", interval: 7 },
    });
    await db.careEvent.create({ data: { plantId: plant.id, type: "WATERING", performedAt: new Date() } });

    const context = await buildLocalContext(plant.id);

    expect(context.wateringGapDays).toBeLessThanOrEqual(0);

    await db.plant.delete({ where: { id: plant.id } });
  });

  it("renvoie des signaux d'arrosage null sans regle ni historique", async () => {
    const plant = await db.plant.create({ data: { userId, name: "Sans regle" } });

    const context = await buildLocalContext(plant.id);

    expect(context.wateringGapDays).toBeNull();
    expect(context.wateringRuleIntervalDays).toBeNull();
    expect(context.daysSinceLastWatering).toBeNull();

    await db.plant.delete({ where: { id: plant.id } });
  });

  it("deduit le stress thermique recent du multiplicateur meteo deja calcule", async () => {
    const plant = await db.plant.create({ data: { userId, name: "Canicule" } });
    await db.weatherProfile.upsert({
      where: { userId },
      create: { userId, city: "Test", latitude: 0, longitude: 0, wateringIntervalMultiplier: 0.7 },
      update: { wateringIntervalMultiplier: 0.7 },
    });

    const context = await buildLocalContext(plant.id);

    expect(context.recentHeatStress).toBe(true);
    expect(context.recentColdSnap).toBe(false);

    await db.plant.delete({ where: { id: plant.id } });
    await db.weatherProfile.delete({ where: { userId } });
  });

  it("detecte un decalage d'exposition entre la plante et le profil de bibliotheque", async () => {
    const entry = await db.plantLibraryEntry.create({
      data: { commonName: "Test bibliotheque", careProfile: { exposure: "Ombre" } },
    });
    const plant = await db.plant.create({
      data: { userId, name: "Plein soleil", exposure: "Plein soleil direct", libraryEntryId: entry.id },
    });

    const context = await buildLocalContext(plant.id);

    expect(context.exposureMismatch).toBe(true);

    await db.plant.delete({ where: { id: plant.id } });
    await db.plantLibraryEntry.delete({ where: { id: entry.id } });
  });

  it("ne conclut rien sur l'exposition si l'un des deux textes manque", async () => {
    const plant = await db.plant.create({ data: { userId, name: "Sans exposition connue" } });

    const context = await buildLocalContext(plant.id);

    expect(context.exposureMismatch).toBeNull();

    await db.plant.delete({ where: { id: plant.id } });
  });

  it("calcule les jours depuis l'acquisition", async () => {
    const plant = await db.plant.create({
      data: { userId, name: "Recente", acquiredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
    });

    const context = await buildLocalContext(plant.id);

    expect(context.daysSinceAcquired).toBe(5);

    await db.plant.delete({ where: { id: plant.id } });
  });
});
