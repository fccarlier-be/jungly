import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { NotFoundError, BadRequestError } from "@/lib/errors";
import { loadPhotoDataUrl, loadSharePlant, pickPlantPhoto } from "@/server/shareCard/data";
import { renderShareCard } from "@/server/shareCard/render";

/**
 * Integration reelle SQLite + rendu reel (satori) : la carte n'est jamais
 * servie pour la plante d'un autre compte, une photo d'une autre plante est
 * refusee, et le PNG produit a bien les dimensions du format demande.
 */
describe("carte de partage (integration reelle)", () => {
  let ownerId: string;
  let otherId: string;
  let plantId: string;
  let otherPlantPhotoId: string;

  beforeAll(async () => {
    const owner = await db.user.create({ data: { email: `test-share-${Date.now()}@example.com`, passwordHash: "x" } });
    const other = await db.user.create({ data: { email: `test-share-other-${Date.now()}@example.com`, passwordHash: "x" } });
    ownerId = owner.id;
    otherId = other.id;
    const plant = await db.plant.create({ data: { userId: ownerId, name: "Monstera", scientificName: "Monstera deliciosa" } });
    plantId = plant.id;
    await db.careEvent.createMany({
      data: [
        { plantId, type: "WATERING" },
        { plantId, type: "WATERING" },
        { plantId, type: "FERTILIZING" },
      ],
    });
    await db.careEvent.create({ data: { plantId, type: "INSPECTION", healthLevel: "GOOD" } });
    const otherPlant = await db.plant.create({ data: { userId: otherId, name: "Pothos" } });
    otherPlantPhotoId = (await db.plantPhoto.create({ data: { plantId: otherPlant.id, url: "/uploads/autre.jpg" } })).id;
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    await db.$disconnect();
  });

  it("charge la plante et ses statistiques pour son proprietaire", async () => {
    const plant = await loadSharePlant(ownerId, plantId);
    expect(plant.waterings).toBe(2);
    expect(plant.fertilizings).toBe(1);
    expect(plant.healthLevel).toBe("GOOD");
  });

  it("refuse la plante d'un autre compte", async () => {
    await expect(loadSharePlant(otherId, plantId)).rejects.toThrow(NotFoundError);
  });

  it("refuse une photo qui n'appartient pas a cette plante", async () => {
    const plant = await loadSharePlant(ownerId, plantId);
    expect(() => pickPlantPhoto(plant, otherPlantPhotoId)).toThrow(BadRequestError);
  });

  it("ne telecharge jamais une URL externe ni un fichier absent", async () => {
    expect(await loadPhotoDataUrl("https://example.com/photo.jpg", 100, 100)).toBeNull();
    expect(await loadPhotoDataUrl("/uploads/inexistant-share-test.jpg", 100, 100)).toBeNull();
  });

  it("produit un PNG aux dimensions du format (carre et story, simple et avant/apres)", async () => {
    const plant = await loadSharePlant(ownerId, plantId);
    const content = { ...plant, now: new Date() };
    const cases = [
      { format: "square" as const, card: { ...content, mode: "single" as const, photo: null }, size: [1080, 1080] },
      {
        format: "story" as const,
        card: {
          ...content,
          mode: "beforeAfter" as const,
          before: { photo: null, date: new Date("2026-03-12") },
          after: { photo: null, date: new Date("2026-09-24") },
        },
        size: [1080, 1920],
      },
    ];
    for (const { format, card, size } of cases) {
      const res = await renderShareCard(format, card);
      const png = Buffer.from(await res.arrayBuffer());
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      // En-tete IHDR : largeur puis hauteur, octets 16 a 24.
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(size);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
  });
});
