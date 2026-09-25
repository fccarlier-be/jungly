import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { completeTaskWithEvent, ensurePendingTaskForRule } from "@/server/careEngine/service";

/**
 * Audit du 2026-09-25 : une regle EXACT_DATE (ponctuelle) recreait sa tache
 * a l'identique des qu'elle etait completee.
 */
describe("regle EXACT_DATE (integration reelle SQLite)", () => {
  let userId: string;
  let plantId: string;

  beforeAll(async () => {
    const user = await db.user.create({ data: { email: `test-exact-${Date.now()}@example.com`, passwordHash: "x" } });
    userId = user.id;
    plantId = (await db.plant.create({ data: { userId, name: "Test" } })).id;
  });

  afterAll(async () => {
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  const pendingFor = (careRuleId: string) => db.task.findMany({ where: { careRuleId, status: { in: ["PENDING", "SNOOZED"] } } });

  it("ne recree pas la tache une fois completee", async () => {
    const exactDate = new Date(Date.now() + 3 * 86400000).toISOString();
    const rule = await db.plantCareRule.create({ data: { plantId, type: "REPOTTING", recurrenceType: "EXACT_DATE", configuration: { exactDate } } });
    const task = await ensurePendingTaskForRule(rule);
    expect(task?.dueAt.toISOString()).toBe(exactDate);

    await completeTaskWithEvent(task!.id, "REPOTTING", {});
    expect(await pendingFor(rule.id)).toHaveLength(0);
  });

  it("cree bien une nouvelle tache si la date de la regle change", async () => {
    const first = new Date(Date.now() + 2 * 86400000).toISOString();
    const rule = await db.plantCareRule.create({ data: { plantId, type: "REPOTTING", recurrenceType: "EXACT_DATE", configuration: { exactDate: first } } });
    const task = await ensurePendingTaskForRule(rule);
    await completeTaskWithEvent(task!.id, "REPOTTING", {});

    const second = new Date(Date.now() + 200 * 86400000).toISOString();
    const updated = await db.plantCareRule.update({ where: { id: rule.id }, data: { configuration: { exactDate: second } } });
    await ensurePendingTaskForRule(updated);
    const pending = await pendingFor(rule.id);
    expect(pending.map((t) => t.dueAt.toISOString())).toEqual([second]);
  });

  it("n'affecte pas les regles recurrentes (la tache suivante est bien creee)", async () => {
    const rule = await db.plantCareRule.create({ data: { plantId, type: "WATERING", recurrenceType: "FIXED_INTERVAL_DAYS", interval: 7 } });
    const task = await ensurePendingTaskForRule(rule);
    await completeTaskWithEvent(task!.id, "WATERING", {});
    expect(await pendingFor(rule.id)).toHaveLength(1);
  });
});
