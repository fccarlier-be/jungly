import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { PlanLimitError } from "@/lib/errors";
import { freePlantLimit } from "@/lib/features";
import { assertCanCreatePlant, getPlanStatus } from "@/server/planLimit";

describe("freePlantLimit", () => {
  const original = process.env.HOSTED_FREE_PLANT_LIMIT;

  afterEach(() => {
    if (original === undefined) delete process.env.HOSTED_FREE_PLANT_LIMIT;
    else process.env.HOSTED_FREE_PLANT_LIMIT = original;
  });

  it("absente (variable non posee) -- pas de palier, comme sur une instance auto-hebergee", () => {
    delete process.env.HOSTED_FREE_PLANT_LIMIT;
    expect(freePlantLimit()).toBeNull();
  });

  it("renvoie le nombre pose", () => {
    process.env.HOSTED_FREE_PLANT_LIMIT = "5";
    expect(freePlantLimit()).toBe(5);
  });

  it("ignore une valeur non entiere ou non positive", () => {
    process.env.HOSTED_FREE_PLANT_LIMIT = "abc";
    expect(freePlantLimit()).toBeNull();
    process.env.HOSTED_FREE_PLANT_LIMIT = "0";
    expect(freePlantLimit()).toBeNull();
    process.env.HOSTED_FREE_PLANT_LIMIT = "-3";
    expect(freePlantLimit()).toBeNull();
  });
});

/**
 * Integration reelle (vraie base SQLite), meme pattern que les autres
 * suites du projet. HOSTED_FREE_PLANT_LIMIT est posee/retiree explicitement
 * a chaque test (vitest ne charge pas de .env -- voir verify-docker.sh, qui
 * ne la pose pas par defaut, comme une instance auto-hebergee).
 */
describe("assertCanCreatePlant / getPlanStatus (integration reelle SQLite)", () => {
  const original = process.env.HOSTED_FREE_PLANT_LIMIT;
  let userId: string;

  afterEach(async () => {
    if (original === undefined) delete process.env.HOSTED_FREE_PLANT_LIMIT;
    else process.env.HOSTED_FREE_PLANT_LIMIT = original;
    if (userId) await db.user.delete({ where: { id: userId } });
  });

  async function createUser(hasUnlimitedAccess = false) {
    const user = await db.user.create({
      data: { email: `test-planlimit-${Date.now()}-${Math.random()}@example.com`, passwordHash: "x", hasUnlimitedAccess },
    });
    userId = user.id;
    return user.id;
  }

  it("aucun palier sur l'instance (variable absente) -- jamais bloque, quel que soit le nombre de plantes", async () => {
    delete process.env.HOSTED_FREE_PLANT_LIMIT;
    const id = await createUser(false);
    for (let i = 0; i < 6; i++) await db.plant.create({ data: { userId: id, name: `Plante ${i}` } });

    await expect(assertCanCreatePlant(id)).resolves.toBeUndefined();
    expect(await getPlanStatus(id)).toEqual({ limit: null, plantCount: 6, hasUnlimitedAccess: false });
  });

  it("palier pose, sous la limite -- autorise", async () => {
    process.env.HOSTED_FREE_PLANT_LIMIT = "5";
    const id = await createUser(false);
    for (let i = 0; i < 4; i++) await db.plant.create({ data: { userId: id, name: `Plante ${i}` } });

    await expect(assertCanCreatePlant(id)).resolves.toBeUndefined();
  });

  it("palier pose, limite atteinte -- refuse avec le nombre exact", async () => {
    process.env.HOSTED_FREE_PLANT_LIMIT = "5";
    const id = await createUser(false);
    for (let i = 0; i < 5; i++) await db.plant.create({ data: { userId: id, name: `Plante ${i}` } });

    await expect(assertCanCreatePlant(id)).rejects.toThrow(PlanLimitError);
    try {
      await assertCanCreatePlant(id);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PlanLimitError);
      expect((err as PlanLimitError).limit).toBe(5);
    }
    expect(await getPlanStatus(id)).toEqual({ limit: 5, plantCount: 5, hasUnlimitedAccess: false });
  });

  it("compte avec hasUnlimitedAccess -- jamais bloque, meme bien au-dela de la limite", async () => {
    process.env.HOSTED_FREE_PLANT_LIMIT = "5";
    const id = await createUser(true);
    for (let i = 0; i < 8; i++) await db.plant.create({ data: { userId: id, name: `Plante ${i}` } });

    await expect(assertCanCreatePlant(id)).resolves.toBeUndefined();
    expect(await getPlanStatus(id)).toEqual({ limit: 5, plantCount: 8, hasUnlimitedAccess: true });
  });
});
