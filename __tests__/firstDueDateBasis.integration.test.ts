import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { ensurePendingTaskForRule } from "@/server/careEngine/service";
import { firstDueDateBasis, addMonths } from "@/server/careEngine/recurrence";

/**
 * Retour utilisateur (ticket #6, 2026-10-01) : une regle "rempoter tous les
 * 24 mois" ajoutee a une plante acquise il y a un an doit tomber dans 12
 * mois, pas dans 24 -- voir firstDueDateBasis() et ses deux appelants
 * (POST /api/care-rules, import de sauvegarde). Integration reelle (vraie
 * base SQLite), meme pattern que exactDateRule.integration.test.ts.
 */
describe("premiere echeance d'une regle a recurrence longue (integration reelle SQLite)", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await db.user.create({ data: { email: `test-first-due-${Date.now()}@example.com`, passwordHash: "x" } });
    userId = user.id;
  });

  afterAll(async () => {
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it("rempotage tous les 24 mois, plante acquise il y a 1 an -> echeance dans 1 an (pas 2)", async () => {
    const acquiredAt = addMonths(new Date(), -12);
    const plant = await db.plant.create({ data: { userId, name: "Test ticket 6", acquiredAt } });
    const rule = await db.plantCareRule.create({
      data: { plantId: plant.id, type: "REPOTTING", recurrenceType: "INTERVAL_MONTHS", interval: 24 },
    });

    const fromDate = firstDueDateBasis(rule.recurrenceType, plant.acquiredAt);
    const task = await ensurePendingTaskForRule(rule, fromDate);

    const expected = addMonths(acquiredAt, 24);
    expect(task?.dueAt.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
  });

  it("sans date d'acquisition -> echeance calculee depuis aujourd'hui (comportement inchange)", async () => {
    const plant = await db.plant.create({ data: { userId, name: "Test sans acquisition" } });
    const rule = await db.plantCareRule.create({
      data: { plantId: plant.id, type: "REPOTTING", recurrenceType: "INTERVAL_MONTHS", interval: 24 },
    });

    const fromDate = firstDueDateBasis(rule.recurrenceType, plant.acquiredAt);
    const task = await ensurePendingTaskForRule(rule, fromDate);

    const expected = addMonths(new Date(), 24);
    expect(task?.dueAt.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
  });

  it("arrosage (recurrence courte) -> acquisition ignoree meme si connue", async () => {
    const acquiredAt = addMonths(new Date(), -12);
    const plant = await db.plant.create({ data: { userId, name: "Test arrosage", acquiredAt } });
    const rule = await db.plantCareRule.create({
      data: { plantId: plant.id, type: "WATERING", recurrenceType: "FIXED_INTERVAL_DAYS", interval: 7 },
    });

    const fromDate = firstDueDateBasis(rule.recurrenceType, plant.acquiredAt);
    const task = await ensurePendingTaskForRule(rule, fromDate);

    const today = new Date();
    const expected = new Date(today);
    expected.setDate(expected.getDate() + 7);
    expect(task?.dueAt.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
  });
});
