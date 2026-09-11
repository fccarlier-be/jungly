import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { dueTasksWhere } from "@/server/careEngine/dueTasks";

/**
 * Test d'integration (vraie base SQLite, vrai client Prisma) plutot qu'un
 * test de fonction pure : le bug du 2026-09-11 n'etait pas dans la logique
 * de dueTasksWhere() elle-meme (correcte), mais dans la maniere dont le
 * driver adapter serialise/compare les dates une fois vraiment executees
 * contre SQLite -- un test qui se contente d'inspecter l'objet where-clause
 * produit ne l'aurait jamais attrape.
 */
describe("dueTasksWhere (integration reelle SQLite)", () => {
  let userId: string;
  let plantId: string;

  beforeAll(async () => {
    const user = await db.user.create({
      data: { email: `test-due-tasks-${Date.now()}@example.com`, passwordHash: "x" },
    });
    userId = user.id;
    const plant = await db.plant.create({ data: { userId: user.id, name: "Test dueTasks" } });
    plantId = plant.id;
  });

  afterAll(async () => {
    // Cascade Prisma (Task.plant, Plant.user onDelete: Cascade) supprime
    // aussi les taches creees par les tests ci-dessous.
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it("inclut une tache PENDING en retard, exclut une tache PENDING future", async () => {
    const past = new Date();
    past.setDate(past.getDate() - 2);
    const future = new Date();
    future.setDate(future.getDate() + 5);

    const overdue = await db.task.create({
      data: { plantId, type: "WATERING", title: "En retard", dueAt: past, status: "PENDING" },
    });
    const upcoming = await db.task.create({
      data: { plantId, type: "WATERING", title: "Future", dueAt: future, status: "PENDING" },
    });

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const due = await db.task.findMany({ where: { id: { in: [overdue.id, upcoming.id] }, ...dueTasksWhere(endOfToday) } });

    expect(due.map((t) => t.id)).toEqual([overdue.id]);
  });

  it("inclut une tache SNOOZED dont le report est passe, exclut celle dont le report est futur", async () => {
    const pastSnooze = new Date();
    pastSnooze.setDate(pastSnooze.getDate() - 1);
    const futureSnooze = new Date();
    futureSnooze.setDate(futureSnooze.getDate() + 3);
    // dueAt originel volontairement tres ancien : seul snoozedUntil doit compter.
    const oldDueAt = new Date("2026-01-01T00:00:00Z");

    const snoozedPast = await db.task.create({
      data: { plantId, type: "WATERING", title: "Report passe", dueAt: oldDueAt, status: "SNOOZED", snoozedUntil: pastSnooze },
    });
    const snoozedFuture = await db.task.create({
      data: { plantId, type: "WATERING", title: "Report futur", dueAt: oldDueAt, status: "SNOOZED", snoozedUntil: futureSnooze },
    });

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const due = await db.task.findMany({
      where: { id: { in: [snoozedPast.id, snoozedFuture.id] }, ...dueTasksWhere(endOfToday) },
    });

    expect(due.map((t) => t.id)).toEqual([snoozedPast.id]);
  });

  it("n'inclut jamais une tache deja COMPLETED, meme en retard", async () => {
    const past = new Date();
    past.setDate(past.getDate() - 10);
    const completed = await db.task.create({
      data: { plantId, type: "WATERING", title: "Terminee", dueAt: past, status: "COMPLETED", completedAt: past },
    });

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const due = await db.task.findMany({ where: { id: completed.id, ...dueTasksWhere(endOfToday) } });

    expect(due).toHaveLength(0);
  });
});
