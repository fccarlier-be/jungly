import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { snoozeTaskById } from "@/server/careEngine/service";
import { ConflictError } from "@/lib/errors";

/**
 * Test d'integration reelle (vraie base SQLite, vrai client Prisma) pour la
 * correction de snoozeTaskById() -- meme pattern que dueTasks.integration.test.ts.
 * snoozeTaskById() utilise desormais un updateMany conditionnel (verification
 * ET transition du statut en une seule operation atomique) au lieu d'un
 * findUnique() suivi d'un update() separes, pour eviter la meme race que
 * completeTaskWithEvent() avant son propre correctif.
 */
describe("snoozeTaskById (integration reelle SQLite)", () => {
  let userId: string;
  let plantId: string;

  beforeAll(async () => {
    const user = await db.user.create({
      data: { email: `test-snooze-${Date.now()}@example.com`, passwordHash: "x" },
    });
    userId = user.id;
    const plant = await db.plant.create({ data: { userId: user.id, name: "Test snooze" } });
    plantId = plant.id;
  });

  afterAll(async () => {
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it("reporte une tache PENDING avec succes", async () => {
    const task = await db.task.create({
      data: { plantId, type: "WATERING", title: "A reporter", dueAt: new Date(), status: "PENDING" },
    });
    const until = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const result = await snoozeTaskById(task.id, until);

    expect(result.status).toBe("SNOOZED");
    expect(result.snoozedUntil?.getTime()).toBe(until.getTime());
  });

  it("refuse de reporter une tache deja COMPLETED (ConflictError, pas d'ecriture)", async () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    const task = await db.task.create({
      data: { plantId, type: "WATERING", title: "Deja terminee", dueAt: past, status: "COMPLETED", completedAt: past },
    });

    await expect(snoozeTaskById(task.id, new Date())).rejects.toThrow(ConflictError);

    const unchanged = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(unchanged.status).toBe("COMPLETED");
    expect(unchanged.snoozedUntil).toBeNull();
  });

  it("refuse de reporter une tache deja SKIPPED", async () => {
    const task = await db.task.create({
      data: { plantId, type: "WATERING", title: "Ignoree", dueAt: new Date(), status: "SKIPPED" },
    });

    await expect(snoozeTaskById(task.id, new Date())).rejects.toThrow(ConflictError);
  });
});
