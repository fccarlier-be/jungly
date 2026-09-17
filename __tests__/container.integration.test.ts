import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resolveContainerFields } from "@/server/containerAssignment";
import { NotFoundError } from "@/lib/errors";

/**
 * Integration reelle (vraie base SQLite) -- meme pattern que les autres
 * suites d'integration du projet (betaSignup, adminPanel, billing,
 * snoozeTaskById). Les contraintes de cle etrangere sont bien appliquees
 * ici (verifie via ces memes tests) : userId doit referencer un vrai
 * User, d'ou la creation prealable.
 */
describe("resolveContainerFields (integration reelle SQLite)", () => {
  let ownerId: string;
  let otherId: string;

  beforeAll(async () => {
    const owner = await db.user.create({ data: { email: `test-container-owner-${Date.now()}@example.com`, passwordHash: "x" } });
    ownerId = owner.id;
    const other = await db.user.create({ data: { email: `test-container-other-${Date.now()}@example.com`, passwordHash: "x" } });
    otherId = other.id;
  });

  afterAll(async () => {
    await db.user.delete({ where: { id: ownerId } });
    await db.user.delete({ where: { id: otherId } });
    await db.$disconnect();
  });

  it("renvoie un objet vide si containerId est absent (ne touche pas au rattachement)", async () => {
    const fields = await resolveContainerFields(ownerId, {});
    expect(fields).toEqual({});
  });

  it("efface containerId et la position si containerId vaut null (detachement)", async () => {
    const fields = await resolveContainerFields(ownerId, { containerId: null });
    expect(fields).toEqual({ containerId: null, positionX: null, positionY: null });
  });

  it("centre la position par defaut si absente a l'assignation", async () => {
    const container = await db.container.create({ data: { userId: ownerId, name: `Jardiniere ${Date.now()}` } });

    const fields = await resolveContainerFields(ownerId, { containerId: container.id });
    expect(fields).toEqual({ containerId: container.id, positionX: 0.5, positionY: 0.5 });
  });

  it("conserve la position fournie explicitement (flux glisser-deposer)", async () => {
    const container = await db.container.create({ data: { userId: ownerId, name: `Jardiniere ${Date.now()}` } });

    const fields = await resolveContainerFields(ownerId, { containerId: container.id, positionX: 0.2, positionY: 0.8 });
    expect(fields).toEqual({ containerId: container.id, positionX: 0.2, positionY: 0.8 });
  });

  it("refuse une jardiniere appartenant a un autre compte", async () => {
    const container = await db.container.create({ data: { userId: otherId, name: `Jardiniere ${Date.now()}` } });

    await expect(resolveContainerFields(ownerId, { containerId: container.id })).rejects.toThrow(NotFoundError);
  });
});

describe("suppression d'une jardiniere (integration reelle SQLite)", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await db.user.create({ data: { email: `test-container-delete-${Date.now()}@example.com`, passwordHash: "x" } });
    userId = user.id;
  });

  afterAll(async () => {
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it("derattache automatiquement les plantes (containerId -> null) sans les supprimer", async () => {
    const container = await db.container.create({ data: { userId, name: `A demolir ${Date.now()}` } });
    const plant = await db.plant.create({
      data: { userId, name: "Plante colocataire", containerId: container.id, positionX: 0.3, positionY: 0.7 },
    });

    await db.container.delete({ where: { id: container.id } });

    const reloaded = await db.plant.findUniqueOrThrow({ where: { id: plant.id } });
    expect(reloaded.containerId).toBeNull();
    // La plante elle-meme n'est jamais supprimee -- seul le rattachement l'est.
    expect(reloaded.name).toBe("Plante colocataire");
  });
});
