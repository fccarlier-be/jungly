import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { completeTaskWithEvent, recordStandaloneCareEvent } from "@/server/careEngine/service";
import { getHealthSummaries } from "@/server/careEngine/health";

/**
 * Integration reelle SQLite (meme pattern que snoozeTaskById) : un releve
 * de sante Mauvais/Critique planifie une inspection de suivi, qui se
 * reconduit tant que la plante reste malade et disparait quand elle va mieux.
 */
describe("releve de sante et inspections de suivi (integration reelle SQLite)", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await db.user.create({ data: { email: `test-health-${Date.now()}@example.com`, passwordHash: "x" } });
    userId = user.id;
  });

  afterAll(async () => {
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  async function newPlant(name: string) {
    return db.plant.create({ data: { userId, name } });
  }

  async function activeFollowUps(plantId: string) {
    return db.task.findMany({ where: { plantId, type: "INSPECTION", status: { in: ["PENDING", "SNOOZED"] } } });
  }

  function daysFromNow(task: { dueAt: Date }) {
    return Math.round((task.dueAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  }

  it("un releve Mauvais planifie un suivi a 3 jours, Critique a 2 jours, sans doublon", async () => {
    const plant = await newPlant("Malade");
    await recordStandaloneCareEvent(plant.id, "INSPECTION", { healthLevel: "POOR" });
    let tasks = await activeFollowUps(plant.id);
    expect(tasks).toHaveLength(1);
    expect(daysFromNow(tasks[0])).toBe(3);

    await recordStandaloneCareEvent(plant.id, "INSPECTION", { healthLevel: "CRITICAL" });
    tasks = await activeFollowUps(plant.id);
    expect(tasks).toHaveLength(1);
    expect(daysFromNow(tasks[0])).toBe(2);
  });

  it("valider le suivi sans releve le reconduit tant que la plante reste malade", async () => {
    const plant = await newPlant("Convalescente");
    await recordStandaloneCareEvent(plant.id, "INSPECTION", { healthLevel: "POOR" });
    const [followUp] = await activeFollowUps(plant.id);

    await completeTaskWithEvent(followUp.id, "INSPECTION", {});
    const next = await activeFollowUps(plant.id);
    expect(next).toHaveLength(1);
    expect(next[0].id).not.toBe(followUp.id);
  });

  it("un releve Bon abandonne le suivi en attente", async () => {
    const plant = await newPlant("Guerie");
    await recordStandaloneCareEvent(plant.id, "INSPECTION", { healthLevel: "CRITICAL" });
    const [followUp] = await activeFollowUps(plant.id);

    await completeTaskWithEvent(followUp.id, "INSPECTION", { healthLevel: "GOOD" });
    expect(await activeFollowUps(plant.id)).toHaveLength(0);
  });

  it("ignore le niveau de sante sur un evenement qui n'est pas une inspection", async () => {
    const plant = await newPlant("Taillee");
    const event = await recordStandaloneCareEvent(plant.id, "PRUNING", { healthLevel: "POOR" });
    expect(event.healthLevel).toBeNull();
    expect(await activeFollowUps(plant.id)).toHaveLength(0);
  });

  it("getHealthSummaries renvoie le dernier releve et le precedent, rien sans releve", async () => {
    const plant = await newPlant("Suivie");
    const other = await newPlant("Jamais relevee");
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await recordStandaloneCareEvent(plant.id, "INSPECTION", { healthLevel: "POOR", performedAt: yesterday });
    await recordStandaloneCareEvent(plant.id, "INSPECTION", { healthLevel: "FAIR", metadata: { symptoms: ["PESTS"] } });

    const summaries = await getHealthSummaries([plant.id, other.id]);
    expect(summaries.get(plant.id)?.current.level).toBe("FAIR");
    expect(summaries.get(plant.id)?.current.symptoms).toEqual(["PESTS"]);
    expect(summaries.get(plant.id)?.previous?.level).toBe("POOR");
    expect(summaries.has(other.id)).toBe(false);
  });
});
