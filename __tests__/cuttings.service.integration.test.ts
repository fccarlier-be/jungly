import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { NotFoundError, ForbiddenError, ConflictError } from "@/lib/errors";
import {
  createListing,
  listOpenListings,
  listMyListings,
  getListingDetail,
  sendMessage,
  cancelListing,
  completeListing,
  createRating,
  countNewListingsSince,
  markCuttingsSeen,
} from "@/server/cuttings/service";

/**
 * Integration reelle (vraie base SQLite), meme pattern que les autres
 * suites du projet. ENABLE_CUTTINGS_MARKETPLACE/CUTTINGS_MESSAGE_ENCRYPTION_KEY
 * sont deja fixes par .env (dev/verify-docker) et par ci.yml (CI) -- ces
 * tests appellent directement les fonctions du service, jamais
 * assertCuttingsMarketplaceEnabled() (verifiee separement au niveau route).
 */
describe("cuttings/service (integration reelle SQLite)", () => {
  let ownerId: string;
  let otherId: string;
  let thirdId: string;
  const suffix = Date.now();

  async function ownedUpload(userId: string): Promise<string> {
    const filename = `test-cutting-${suffix}-${Math.random().toString(36).slice(2)}.jpg`;
    await db.upload.create({ data: { filename, userId } });
    return `/uploads/${filename}`;
  }

  beforeEach(async () => {
    const owner = await db.user.create({ data: { email: `cutting-owner-${suffix}@example.com`, passwordHash: "x" } });
    const other = await db.user.create({ data: { email: `cutting-other-${suffix}@example.com`, passwordHash: "x" } });
    const third = await db.user.create({ data: { email: `cutting-third-${suffix}@example.com`, passwordHash: "x" } });
    ownerId = owner.id;
    otherId = other.id;
    thirdId = third.id;
  });

  afterEach(async () => {
    await db.cuttingRating.deleteMany({ where: { OR: [{ raterId: ownerId }, { raterId: otherId }, { raterId: thirdId }] } });
    await db.cuttingMessage.deleteMany({ where: { OR: [{ senderId: ownerId }, { senderId: otherId }, { senderId: thirdId }] } });
    await db.cuttingListing.deleteMany({ where: { userId: { in: [ownerId, otherId, thirdId] } } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, otherId, thirdId] } } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("createListing exige un upload possede par l'auteur", async () => {
    await expect(
      createListing(ownerId, { title: "Bouture", type: "DON", photoUrls: ["/uploads/inconnu.jpg"] }),
    ).rejects.toThrow();
  });

  it("createListing puis listOpenListings la fait apparaitre", async () => {
    const url = await ownedUpload(ownerId);
    const listing = await createListing(ownerId, { title: "Monstera", type: "DON", photoUrls: [url] });

    const open = await listOpenListings();
    expect(open.some((l) => l.id === listing.id)).toBe(true);

    const mine = await listMyListings(ownerId);
    expect(mine.map((l) => l.id)).toContain(listing.id);
  });

  it("sendMessage : un non-proprietaire peut ecrire au proprietaire", async () => {
    const url = await ownedUpload(ownerId);
    const listing = await createListing(ownerId, { title: "Pothos", type: "ECHANGE", photoUrls: [url] });

    await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "Toujours dispo ?" });

    const detailForOther = await getListingDetail(listing.id, otherId);
    expect(detailForOther.messages).toHaveLength(1);
    expect(detailForOther.messages[0].body).toBe("Toujours dispo ?");

    const detailForOwner = await getListingDetail(listing.id, ownerId);
    expect(detailForOwner.messages).toHaveLength(1);
    expect(detailForOwner.participants.map((p) => p.id)).toEqual([otherId]);
  });

  it("sendMessage : le proprietaire ne peut pas ecrire a un compte qui n'a jamais engage de conversation", async () => {
    const url = await ownedUpload(ownerId);
    const listing = await createListing(ownerId, { title: "Ficus", type: "DON", photoUrls: [url] });

    await expect(sendMessage(ownerId, listing.id, { recipientId: otherId, body: "Salut" })).rejects.toThrow(ForbiddenError);
  });

  it("sendMessage : refuse un destinataire sans lien avec l'annonce (ni proprietaire ni deja engage)", async () => {
    const url = await ownedUpload(ownerId);
    const listing = await createListing(ownerId, { title: "Calathea", type: "DON", photoUrls: [url] });
    await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "Interesse" });

    await expect(sendMessage(otherId, listing.id, { recipientId: thirdId, body: "..." })).rejects.toThrow(ForbiddenError);
  });

  it("getListingDetail isole les fils : un visiteur ne voit jamais les messages d'un autre visiteur", async () => {
    const url = await ownedUpload(ownerId);
    const listing = await createListing(ownerId, { title: "Sansevieria", type: "DON", photoUrls: [url] });
    await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "De other" });
    await sendMessage(thirdId, listing.id, { recipientId: ownerId, body: "De third" });

    const detailForOther = await getListingDetail(listing.id, otherId);
    expect(detailForOther.messages).toHaveLength(1);
    expect(detailForOther.messages[0].body).toBe("De other");
    expect(detailForOther.participants).toEqual([]); // seul le proprietaire voit les participants

    const detailForOwner = await getListingDetail(listing.id, ownerId);
    expect(detailForOwner.messages).toHaveLength(2);
    expect(detailForOwner.participants.map((p) => p.id).sort()).toEqual([otherId, thirdId].sort());
  });

  it("cancelListing : seul le proprietaire peut annuler, uniquement depuis OUVERTE", async () => {
    const url = await ownedUpload(ownerId);
    const listing = await createListing(ownerId, { title: "Aloe", type: "DON", photoUrls: [url] });

    await expect(cancelListing(otherId, listing.id)).rejects.toThrow(ForbiddenError);

    await cancelListing(ownerId, listing.id);
    const detail = await getListingDetail(listing.id, ownerId);
    expect(detail.status).toBe("ANNULEE");

    await expect(cancelListing(ownerId, listing.id)).rejects.toThrow(ConflictError);
  });

  it("sendMessage refuse tout nouveau message sur une annonce annulee", async () => {
    const url = await ownedUpload(ownerId);
    const listing = await createListing(ownerId, { title: "Yucca", type: "DON", photoUrls: [url] });
    await cancelListing(ownerId, listing.id);

    await expect(sendMessage(otherId, listing.id, { recipientId: ownerId, body: "Encore dispo ?" })).rejects.toThrow(ConflictError);
  });

  it("completeListing exige un compte ayant deja echange, puis verrouille le statut", async () => {
    const url = await ownedUpload(ownerId);
    const listing = await createListing(ownerId, { title: "Orchidee", type: "ECHANGE", photoUrls: [url] });

    await expect(completeListing(ownerId, listing.id, otherId)).rejects.toThrow(ConflictError);

    await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "Je le prends" });
    await expect(completeListing(otherId, listing.id, otherId)).rejects.toThrow(ForbiddenError);

    await completeListing(ownerId, listing.id, otherId);
    const detail = await getListingDetail(listing.id, ownerId);
    expect(detail.status).toBe("TERMINEE");
    expect(detail.completedWithUserId).toBe(otherId);
  });

  it("createRating : reserve aux deux participants, chacun note l'autre une seule fois", async () => {
    const url = await ownedUpload(ownerId);
    const listing = await createListing(ownerId, { title: "Philodendron", type: "DON", photoUrls: [url] });
    await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "Interesse" });
    await completeListing(ownerId, listing.id, otherId);

    await expect(createRating(thirdId, listing.id, { score: 5 })).rejects.toThrow(ForbiddenError);

    await createRating(ownerId, listing.id, { score: 4, comment: "Bouture conforme aux photos" });
    await expect(createRating(ownerId, listing.id, { score: 3 })).rejects.toThrow(ConflictError);

    const detailForOwner = await getListingDetail(listing.id, ownerId);
    expect(detailForOwner.myRating).toEqual({ score: 4, comment: "Bouture conforme aux photos" });

    const detailForOther = await getListingDetail(listing.id, otherId);
    expect(detailForOther.counterpartRating).toEqual({ score: 4, comment: "Bouture conforme aux photos" });
    expect(detailForOther.myRating).toBeNull();

    await createRating(otherId, listing.id, { score: 5 });
    const detailForOwnerAfter = await getListingDetail(listing.id, ownerId);
    expect(detailForOwnerAfter.counterpartRating).toEqual({ score: 5, comment: null });
  });

  it("createRating refuse tant que l'annonce n'est pas terminee", async () => {
    const url = await ownedUpload(ownerId);
    const listing = await createListing(ownerId, { title: "Croton", type: "DON", photoUrls: [url] });
    await expect(createRating(ownerId, listing.id, { score: 5 })).rejects.toThrow(ConflictError);
  });

  it("countNewListingsSince ne compte jamais les annonces du compte lui-meme", async () => {
    const url = await ownedUpload(ownerId);
    await createListing(ownerId, { title: "Basilic", type: "DON", photoUrls: [url] });

    expect(await countNewListingsSince(ownerId)).toBe(0);
  });

  it("countNewListingsSince compte les annonces ouvertes d'autrui depuis le dernier passage, markCuttingsSeen la remet a zero", async () => {
    const url = await ownedUpload(ownerId);
    await createListing(ownerId, { title: "Hoya", type: "ECHANGE", photoUrls: [url] });

    expect(await countNewListingsSince(otherId)).toBeGreaterThanOrEqual(1);

    await markCuttingsSeen(otherId);
    expect(await countNewListingsSince(otherId)).toBe(0);

    const url2 = await ownedUpload(ownerId);
    await createListing(ownerId, { title: "Peperomia", type: "DON", photoUrls: [url2] });
    expect(await countNewListingsSince(otherId)).toBe(1);
  });

  it("getListingDetail refuse un identifiant inconnu", async () => {
    await expect(getListingDetail("inconnu", ownerId)).rejects.toThrow(NotFoundError);
  });
});
