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
  markThreadRead,
  countUnreadMessages,
  listConversationListings,
} from "@/server/cuttings/service";
import { setPseudo } from "@/server/cuttings/pseudo";
import { isCuttingListingPhoto } from "@/server/cuttings/photos";

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
    // Sans pseudo, publier/ecrire est refuse -- pseudos uniques par test
    // (suffix) puisque pseudoKey est unique sur toute la table.
    await setPseudo(ownerId, `Vendeur ${suffix}`);
    await setPseudo(otherId, `Acheteuse ${suffix}`);
    await setPseudo(thirdId, `Curieux ${suffix}`);
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

  it("createListing et sendMessage exigent un pseudo", async () => {
    const nameless = await db.user.create({ data: { email: `cutting-nameless-${suffix}@example.com`, passwordHash: "x" } });
    try {
      const url = await ownedUpload(nameless.id);
      await expect(createListing(nameless.id, { title: "X", type: "DON", photoUrls: [url] })).rejects.toThrow(ConflictError);

      const ownerUrl = await ownedUpload(ownerId);
      const listing = await createListing(ownerId, { title: "Y", type: "DON", photoUrls: [ownerUrl] });
      await expect(sendMessage(nameless.id, listing.id, { recipientId: ownerId, body: "Salut" })).rejects.toThrow(ConflictError);
    } finally {
      await db.user.delete({ where: { id: nameless.id } });
    }
  });

  it("setPseudo refuse un doublon meme different par la casse, les accents ou les separateurs", async () => {
    await setPseudo(ownerId, "Léa du balcon");
    await expect(setPseudo(otherId, "lea du balcon")).rejects.toThrow(ConflictError);
    await expect(setPseudo(otherId, "Lea.du.balcon")).rejects.toThrow(ConflictError);
    // Un compte peut re-enregistrer son propre pseudo (ex. changer la casse).
    await expect(setPseudo(ownerId, "LÉA du Balcon")).resolves.toBe("LÉA du Balcon");
  });

  it("n'expose que le pseudo (jamais le nom reel) sur l'annonce et dans les messages", async () => {
    await db.user.update({ where: { id: ownerId }, data: { name: "Nom Reel Secret" } });
    const url = await ownedUpload(ownerId);
    const listing = await createListing(ownerId, { title: "Pothos", type: "DON", photoUrls: [url] });
    await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "Bonjour" });

    const detail = await getListingDetail(listing.id, otherId);
    expect(detail.owner.pseudo).toBe(`Vendeur ${suffix}`);
    expect(detail.messages[0].senderPseudo).toBe(`Acheteuse ${suffix}`);
    expect(JSON.stringify(detail)).not.toContain("Nom Reel Secret");
  });

  it("deux acheteurs ecrivent au meme vendeur : fils separes, pseudos, non-lus et lecture independants", async () => {
    const url = await ownedUpload(ownerId);
    const listing = await createListing(ownerId, { title: "Monstera", type: "DON", photoUrls: [url] });
    await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "Moi je suis dispo samedi" });
    await sendMessage(thirdId, listing.id, { recipientId: ownerId, body: "Et moi dimanche" });
    await sendMessage(thirdId, listing.id, { recipientId: ownerId, body: "Toujours d'actualite ?" });

    const detail = await getListingDetail(listing.id, ownerId);
    expect(detail.participants).toHaveLength(2);
    const byId = new Map(detail.participants.map((p) => [p.id, p]));
    expect(byId.get(otherId)).toMatchObject({ pseudo: `Acheteuse ${suffix}`, unreadCount: 1 });
    expect(byId.get(thirdId)).toMatchObject({ pseudo: `Curieux ${suffix}`, unreadCount: 2 });
    // Le plus recemment actif d'abord.
    expect(detail.participants[0].id).toBe(thirdId);
    expect(await countUnreadMessages(ownerId)).toBe(3);

    // Lire le fil de l'un ne touche pas a celui de l'autre.
    await markThreadRead(ownerId, listing.id, thirdId);
    expect(await countUnreadMessages(ownerId)).toBe(1);

    await sendMessage(ownerId, listing.id, { recipientId: otherId, body: "Samedi parfait !" });
    const forOther = await getListingDetail(listing.id, otherId);
    expect(forOther.unreadFromOwner).toBe(1);
    expect(forOther.messages.map((m) => m.body)).toEqual(["Moi je suis dispo samedi", "Samedi parfait !"]);
  });

  it("listConversationListings regroupe les annonces ou l'on est partie, avec non-lus, les plus actives d'abord", async () => {
    const urlA = await ownedUpload(ownerId);
    const urlB = await ownedUpload(thirdId);
    const listingA = await createListing(ownerId, { title: "A", type: "DON", photoUrls: [urlA] });
    const listingB = await createListing(thirdId, { title: "B", type: "DON", photoUrls: [urlB] });
    await sendMessage(otherId, listingA.id, { recipientId: ownerId, body: "Pour A" });
    await new Promise((r) => setTimeout(r, 5));
    await sendMessage(otherId, listingB.id, { recipientId: thirdId, body: "Pour B" });

    const forOther = await listConversationListings(otherId);
    expect(forOther.map((l) => l.id)).toEqual([listingB.id, listingA.id]);
    expect(forOther.every((l) => l.unreadCount === 0)).toBe(true);

    const forOwner = await listConversationListings(ownerId);
    expect(forOwner).toHaveLength(1);
    expect(forOwner[0]).toMatchObject({ id: listingA.id, unreadCount: 1 });
    expect(await listConversationListings(thirdId)).toHaveLength(1);
  });

  it("isCuttingListingPhoto reconnait une photo d'annonce et rejette tout le reste", async () => {
    const filename = `${crypto.randomUUID()}.jpg`;
    await db.upload.create({ data: { filename, userId: ownerId } });
    await createListing(ownerId, { title: "Photo", type: "DON", photoUrls: [`/uploads/${filename}`] });

    expect(await isCuttingListingPhoto(`/uploads/${filename}`)).toBe(true);
    expect(await isCuttingListingPhoto(`/uploads/${crypto.randomUUID()}.jpg`)).toBe(false);
    expect(await isCuttingListingPhoto("/uploads/%25.jpg")).toBe(false);
    expect(await isCuttingListingPhoto("/uploads/../secret.jpg")).toBe(false);
  });
});
