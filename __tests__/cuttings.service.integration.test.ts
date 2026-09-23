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
  recordTransaction,
  createRating,
  listMyTransactions,
  countRatingsToGive,
  getMemberProfile,
  getReputations,
  countNewListingsSince,
  markCuttingsSeen,
  markThreadRead,
  countUnreadMessages,
  listConversationListings,
} from "@/server/cuttings/service";
import { setPseudo } from "@/server/cuttings/pseudo";
import { isCuttingListingPhoto } from "@/server/cuttings/photos";
import { createReport, listReports, markReportHandled, countOpenReports } from "@/server/cuttings/reports";

/**
 * Integration reelle (vraie base SQLite), meme pattern que les autres
 * suites du projet. ENABLE_CUTTINGS_MARKETPLACE/CUTTINGS_MESSAGE_ENCRYPTION_KEY
 * sont fixes par verify-docker.sh (dev) et ci.yml (CI) -- ces tests appellent
 * directement les fonctions du service, jamais assertCuttingsMarketplaceEnabled()
 * (verifiee separement au niveau route).
 */
describe("cuttings/service (integration reelle SQLite)", () => {
  let ownerId: string;
  let otherId: string;
  let thirdId: string;
  const suffix = Date.now();

  async function ownedUpload(userId: string): Promise<string> {
    const filename = `${crypto.randomUUID()}.jpg`;
    await db.upload.create({ data: { filename, userId } });
    return `/uploads/${filename}`;
  }

  async function newListing(userId: string, overrides: { title?: string; quantity?: number; type?: "DON" | "ECHANGE" } = {}) {
    return createListing(userId, {
      title: overrides.title ?? "Bouture",
      type: overrides.type ?? "DON",
      quantity: overrides.quantity ?? 1,
      photoUrls: [await ownedUpload(userId)],
      noSaleAccepted: true,
    });
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
    const ids = [ownerId, otherId, thirdId];
    await db.cuttingReport.deleteMany({ where: { OR: [{ reporterId: { in: ids } }, { reportedUserId: { in: ids } }] } });
    await db.cuttingListing.deleteMany({ where: { userId: { in: ids } } }); // cascade : messages, transactions, notes
    await db.user.deleteMany({ where: { id: { in: ids } } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe("annonces", () => {
    it("createListing exige un upload possede par l'auteur", async () => {
      await expect(
        createListing(ownerId, { title: "Bouture", type: "DON", quantity: 1, photoUrls: ["/uploads/inconnu.jpg"], noSaleAccepted: true }),
      ).rejects.toThrow();
    });

    it("createListing puis listOpenListings et listMyListings la font apparaitre, avec sa quantite", async () => {
      const listing = await newListing(ownerId, { title: "Monstera", quantity: 5 });
      expect(listing).toMatchObject({ quantity: 5, remaining: 5 });

      const open = await listOpenListings();
      expect(open.some((l) => l.id === listing.id)).toBe(true);
      expect((await listMyListings(ownerId)).map((l) => l.id)).toContain(listing.id);
    });

    it("createListing exige un pseudo", async () => {
      const nameless = await db.user.create({ data: { email: `cutting-nameless-${suffix}@example.com`, passwordHash: "x" } });
      try {
        await expect(newListing(nameless.id)).rejects.toThrow(ConflictError);
      } finally {
        await db.upload.deleteMany({ where: { userId: nameless.id } });
        await db.user.delete({ where: { id: nameless.id } });
      }
    });

    it("getListingDetail refuse un identifiant inconnu", async () => {
      await expect(getListingDetail("inconnu", ownerId)).rejects.toThrow(NotFoundError);
    });

    it("n'expose que le pseudo (jamais le nom reel) sur l'annonce et dans les messages", async () => {
      await db.user.update({ where: { id: ownerId }, data: { name: "Nom Reel Secret" } });
      const listing = await newListing(ownerId);
      await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "Bonjour" });

      const detail = await getListingDetail(listing.id, otherId);
      expect(detail.owner.pseudo).toBe(`Vendeur ${suffix}`);
      expect(detail.messages[0].senderPseudo).toBe(`Acheteuse ${suffix}`);
      expect(JSON.stringify(detail)).not.toContain("Nom Reel Secret");
    });

    it("isCuttingListingPhoto reconnait une photo d'annonce et rejette tout le reste", async () => {
      const listing = await newListing(ownerId);
      const [url] = (await getListingDetail(listing.id, ownerId)).photoUrls;

      expect(await isCuttingListingPhoto(url)).toBe(true);
      expect(await isCuttingListingPhoto(`/uploads/${crypto.randomUUID()}.jpg`)).toBe(false);
      expect(await isCuttingListingPhoto("/uploads/%25.jpg")).toBe(false);
      expect(await isCuttingListingPhoto("/uploads/../secret.jpg")).toBe(false);
    });
  });

  describe("pseudos", () => {
    it("setPseudo refuse un doublon meme different par la casse, les accents ou les separateurs", async () => {
      await setPseudo(ownerId, "Léa du balcon");
      await expect(setPseudo(otherId, "lea du balcon")).rejects.toThrow(ConflictError);
      await expect(setPseudo(otherId, "Lea.du.balcon")).rejects.toThrow(ConflictError);
      // Un compte peut re-enregistrer son propre pseudo (ex. changer la casse).
      await expect(setPseudo(ownerId, "LÉA du Balcon")).resolves.toBe("LÉA du Balcon");
    });
  });

  describe("messagerie", () => {
    it("un non-proprietaire peut ecrire au proprietaire", async () => {
      const listing = await newListing(ownerId, { type: "ECHANGE" });
      await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "Toujours dispo ?" });

      const detailForOther = await getListingDetail(listing.id, otherId);
      expect(detailForOther.messages).toHaveLength(1);
      expect(detailForOther.messages[0].body).toBe("Toujours dispo ?");

      const detailForOwner = await getListingDetail(listing.id, ownerId);
      expect(detailForOwner.messages).toHaveLength(1);
      expect(detailForOwner.participants.map((p) => p.id)).toEqual([otherId]);
    });

    it("sendMessage exige un pseudo", async () => {
      const nameless = await db.user.create({ data: { email: `cutting-nameless2-${suffix}@example.com`, passwordHash: "x" } });
      try {
        const listing = await newListing(ownerId);
        await expect(sendMessage(nameless.id, listing.id, { recipientId: ownerId, body: "Salut" })).rejects.toThrow(ConflictError);
      } finally {
        await db.user.delete({ where: { id: nameless.id } });
      }
    });

    it("le proprietaire ne peut pas ecrire a un compte qui n'a jamais engage de conversation", async () => {
      const listing = await newListing(ownerId);
      await expect(sendMessage(ownerId, listing.id, { recipientId: otherId, body: "Salut" })).rejects.toThrow(ForbiddenError);
    });

    it("refuse un destinataire sans lien avec l'annonce (ni proprietaire ni deja engage)", async () => {
      const listing = await newListing(ownerId);
      await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "Interesse" });
      await expect(sendMessage(otherId, listing.id, { recipientId: thirdId, body: "..." })).rejects.toThrow(ForbiddenError);
    });

    it("isole les fils : un visiteur ne voit jamais les messages d'un autre visiteur", async () => {
      const listing = await newListing(ownerId);
      await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "De other" });
      await sendMessage(thirdId, listing.id, { recipientId: ownerId, body: "De third" });

      const detailForOther = await getListingDetail(listing.id, otherId);
      expect(detailForOther.messages.map((m) => m.body)).toEqual(["De other"]);
      expect(detailForOther.participants).toEqual([]);

      const detailForOwner = await getListingDetail(listing.id, ownerId);
      expect(detailForOwner.messages).toHaveLength(2);
      expect(detailForOwner.participants.map((p) => p.id).sort()).toEqual([otherId, thirdId].sort());
    });

    it("deux acheteurs ecrivent au meme vendeur : fils separes, pseudos, non-lus et lecture independants", async () => {
      const listing = await newListing(ownerId);
      await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "Moi je suis dispo samedi" });
      await sendMessage(thirdId, listing.id, { recipientId: ownerId, body: "Et moi dimanche" });
      await sendMessage(thirdId, listing.id, { recipientId: ownerId, body: "Toujours d'actualite ?" });

      const detail = await getListingDetail(listing.id, ownerId);
      expect(detail.participants).toHaveLength(2);
      const byId = new Map(detail.participants.map((p) => [p.id, p]));
      expect(byId.get(otherId)).toMatchObject({ pseudo: `Acheteuse ${suffix}`, unreadCount: 1 });
      expect(byId.get(thirdId)).toMatchObject({ pseudo: `Curieux ${suffix}`, unreadCount: 2 });
      expect(detail.participants[0].id).toBe(thirdId); // le plus recemment actif d'abord
      expect(await countUnreadMessages(ownerId)).toBe(3);

      await markThreadRead(ownerId, listing.id, thirdId);
      expect(await countUnreadMessages(ownerId)).toBe(1);

      await sendMessage(ownerId, listing.id, { recipientId: otherId, body: "Samedi parfait !" });
      const forOther = await getListingDetail(listing.id, otherId);
      expect(forOther.unreadFromOwner).toBe(1);
      expect(forOther.messages.map((m) => m.body)).toEqual(["Moi je suis dispo samedi", "Samedi parfait !"]);
    });

    it("listConversationListings regroupe les annonces ou l'on est partie, avec non-lus, les plus actives d'abord", async () => {
      const listingA = await newListing(ownerId, { title: "A" });
      const listingB = await newListing(thirdId, { title: "B" });
      await sendMessage(otherId, listingA.id, { recipientId: ownerId, body: "Pour A" });
      await new Promise((r) => setTimeout(r, 5));
      await sendMessage(otherId, listingB.id, { recipientId: thirdId, body: "Pour B" });

      const forOther = await listConversationListings(otherId);
      expect(forOther.map((l) => l.id)).toEqual([listingB.id, listingA.id]);
      expect(forOther.every((l) => l.unreadCount === 0)).toBe(true);

      const forOwner = await listConversationListings(ownerId);
      expect(forOwner).toHaveLength(1);
      expect(forOwner[0]).toMatchObject({ id: listingA.id, unreadCount: 1 });
    });
  });

  describe("quantites et transactions", () => {
    it("5 boutures : 3 a X, 1 a Y, 1 a Z = 3 transactions pour une seule annonce, TERMINEE quand le stock tombe a 0", async () => {
      const listing = await newListing(ownerId, { title: "Menthe", quantity: 5 });
      await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "J'en veux 3" });
      await sendMessage(thirdId, listing.id, { recipientId: ownerId, body: "Moi 1 ou 2" });

      await recordTransaction(ownerId, listing.id, { recipientId: otherId, quantity: 3 });
      let detail = await getListingDetail(listing.id, ownerId);
      expect(detail).toMatchObject({ status: "OUVERTE", quantity: 5, remaining: 2 });

      await recordTransaction(ownerId, listing.id, { recipientId: thirdId, quantity: 1 });
      detail = await getListingDetail(listing.id, ownerId);
      expect(detail).toMatchObject({ status: "OUVERTE", remaining: 1 });

      // Un meme destinataire peut revenir chercher le reste.
      await recordTransaction(ownerId, listing.id, { recipientId: thirdId, quantity: 1 });
      detail = await getListingDetail(listing.id, ownerId);
      expect(detail).toMatchObject({ status: "TERMINEE", remaining: 0 });
      expect(detail.transactions).toHaveLength(3);
      expect(detail.transactions.map((t) => t.quantity).sort()).toEqual([1, 1, 3]);

      // Plus rien a remettre.
      await expect(recordTransaction(ownerId, listing.id, { recipientId: otherId, quantity: 1 })).rejects.toThrow(ConflictError);
    });

    it("refuse de depasser le stock restant", async () => {
      const listing = await newListing(ownerId, { quantity: 2 });
      await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "Interesse" });
      await expect(recordTransaction(ownerId, listing.id, { recipientId: otherId, quantity: 3 })).rejects.toThrow(/Il ne reste que 2/);
      expect((await getListingDetail(listing.id, ownerId)).remaining).toBe(2);
    });

    it("seul le proprietaire enregistre un echange, et seulement avec quelqu'un qui a ecrit", async () => {
      const listing = await newListing(ownerId, { quantity: 2 });
      await expect(recordTransaction(ownerId, listing.id, { recipientId: otherId, quantity: 1 })).rejects.toThrow(ConflictError);

      await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "Je le prends" });
      await expect(recordTransaction(otherId, listing.id, { recipientId: otherId, quantity: 1 })).rejects.toThrow(ForbiddenError);
      await expect(recordTransaction(ownerId, listing.id, { recipientId: ownerId, quantity: 1 })).rejects.toThrow(ConflictError);
    });

    it("un demandeur ne voit que ses propres echanges, le proprietaire les voit tous", async () => {
      const listing = await newListing(ownerId, { quantity: 4 });
      await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "A" });
      await sendMessage(thirdId, listing.id, { recipientId: ownerId, body: "B" });
      await recordTransaction(ownerId, listing.id, { recipientId: otherId, quantity: 2 });
      await recordTransaction(ownerId, listing.id, { recipientId: thirdId, quantity: 1 });

      const forOther = await getListingDetail(listing.id, otherId);
      expect(forOther.transactions).toHaveLength(1);
      expect(forOther.transactions[0]).toMatchObject({ quantity: 2, iAmOwner: false });
      expect(forOther.transactions[0].counterpart.id).toBe(ownerId);

      const forOwner = await getListingDetail(listing.id, ownerId);
      expect(forOwner.transactions).toHaveLength(2);
      expect(forOwner.transactions.every((t) => t.iAmOwner)).toBe(true);
    });

    it("cancelListing : ANNULEE sans echange, TERMINEE (echanges conserves) apres un echange, seulement par le proprietaire", async () => {
      const untouched = await newListing(ownerId);
      await expect(cancelListing(otherId, untouched.id)).rejects.toThrow(ForbiddenError);
      await cancelListing(ownerId, untouched.id);
      expect((await getListingDetail(untouched.id, ownerId)).status).toBe("ANNULEE");
      await expect(cancelListing(ownerId, untouched.id)).rejects.toThrow(ConflictError);
      await expect(sendMessage(otherId, untouched.id, { recipientId: ownerId, body: "Encore dispo ?" })).rejects.toThrow(ConflictError);

      const partial = await newListing(ownerId, { quantity: 3 });
      await sendMessage(otherId, partial.id, { recipientId: ownerId, body: "Oui" });
      await recordTransaction(ownerId, partial.id, { recipientId: otherId, quantity: 1 });
      await cancelListing(ownerId, partial.id);
      const detail = await getListingDetail(partial.id, ownerId);
      expect(detail.status).toBe("TERMINEE");
      expect(detail.transactions).toHaveLength(1);
    });
  });

  describe("notes et reputation", () => {
    async function completedTransaction(quantity = 1) {
      const listing = await newListing(ownerId, { quantity });
      await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "Interesse" });
      await recordTransaction(ownerId, listing.id, { recipientId: otherId, quantity });
      const [tx] = (await getListingDetail(listing.id, ownerId)).transactions;
      return { listing, tx };
    }

    it("chaque participant note l'autre une seule fois PAR transaction, personne d'autre ne peut noter", async () => {
      const { tx } = await completedTransaction();

      await expect(createRating(thirdId, tx.id, { score: 5 })).rejects.toThrow(ForbiddenError);
      await expect(createRating(ownerId, "inconnu", { score: 5 })).rejects.toThrow(NotFoundError);

      await createRating(ownerId, tx.id, { score: 4, comment: "Bouture conforme aux photos" });
      await expect(createRating(ownerId, tx.id, { score: 3 })).rejects.toThrow(ConflictError);

      const asOwner = (await listMyTransactions(ownerId)).find((t) => t.id === tx.id)!;
      expect(asOwner.myRating).toEqual({ score: 4, comment: "Bouture conforme aux photos" });
      expect(asOwner.counterpartRating).toBeNull();

      const asOther = (await listMyTransactions(otherId)).find((t) => t.id === tx.id)!;
      expect(asOther.counterpartRating).toEqual({ score: 4, comment: "Bouture conforme aux photos" });
      expect(asOther.myRating).toBeNull();

      await createRating(otherId, tx.id, { score: 5 });
      const asOwnerAfter = (await listMyTransactions(ownerId)).find((t) => t.id === tx.id)!;
      expect(asOwnerAfter.counterpartRating).toEqual({ score: 5, comment: null });
    });

    it("countRatingsToGive compte les echanges pas encore notes par l'appelant", async () => {
      const { tx } = await completedTransaction();
      expect(await countRatingsToGive(ownerId)).toBe(1);
      expect(await countRatingsToGive(otherId)).toBe(1);
      expect(await countRatingsToGive(thirdId)).toBe(0);

      await createRating(ownerId, tx.id, { score: 5 });
      expect(await countRatingsToGive(ownerId)).toBe(0);
      expect(await countRatingsToGive(otherId)).toBe(1);
    });

    it("la reputation est la moyenne des notes recues, visible sur l'annonce et le profil public", async () => {
      const first = await completedTransaction();
      const second = await completedTransaction();
      await createRating(otherId, first.tx.id, { score: 5, comment: "Super vendeur" });
      await createRating(otherId, second.tx.id, { score: 4 });

      expect((await getReputations([ownerId])).get(ownerId)).toEqual({ average: 4.5, count: 2 });
      expect((await getReputations([thirdId])).get(thirdId)).toEqual({ average: null, count: 0 });

      // Sur une annonce ouverte (liste) comme sur une fiche (detail, meme terminee).
      const stillOpen = await newListing(ownerId, { title: "Encore dispo" });
      const open = await listOpenListings();
      expect(open.find((l) => l.id === stillOpen.id)?.owner.reputation).toEqual({ average: 4.5, count: 2 });
      expect((await getListingDetail(first.listing.id, thirdId)).owner.reputation).toEqual({ average: 4.5, count: 2 });

      const profile = await getMemberProfile(ownerId);
      expect(profile).toMatchObject({ pseudo: `Vendeur ${suffix}`, transactionCount: 2, reputation: { average: 4.5, count: 2 } });
      expect(profile.ratings.map((r) => r.comment)).toContain("Super vendeur");
      expect(profile.ratings[0].raterPseudo).toBe(`Acheteuse ${suffix}`);
      expect(JSON.stringify(profile)).not.toContain("@example.com");

      await expect(getMemberProfile("inconnu")).rejects.toThrow(NotFoundError);
    });
  });

  describe("signalements", () => {
    it("un membre signale l'autre partie d'une annonce, avec les messages en preuve chiffree lisible par l'admin", async () => {
      const listing = await newListing(ownerId);
      await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "Bonjour" });
      await sendMessage(ownerId, listing.id, { recipientId: otherId, body: "Je te la vends 5 euros" });

      await createReport(otherId, { reportedUserId: ownerId, listingId: listing.id, reason: "VENTE", comment: "Demande de l'argent" });

      const reports = (await listReports()).filter((r) => r.reporter.id === otherId);
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatchObject({ reason: "VENTE", status: "OUVERT", comment: "Demande de l'argent", reportedTotal: 1 });
      expect(reports[0].reported.id).toBe(ownerId);
      expect(reports[0].evidence.map((m) => m.body)).toEqual(["Bonjour", "Je te la vends 5 euros"]);
      expect(reports[0].evidence[1].from).toBe(`Vendeur ${suffix}`);
      expect(await countOpenReports()).toBeGreaterThanOrEqual(1);

      // Les preuves ne sont jamais stockees en clair.
      const raw = await db.cuttingReport.findFirstOrThrow({ where: { id: reports[0].id } });
      expect(JSON.stringify(raw)).not.toContain("5 euros");

      await markReportHandled(reports[0].id);
      expect((await listReports()).find((r) => r.id === reports[0].id)?.status).toBe("TRAITE");
      await expect(markReportHandled(reports[0].id)).rejects.toThrow(NotFoundError);
    });

    it("refuse : doublon ouvert, auto-signalement, tiers sans lien avec l'annonce, annonce inconnue", async () => {
      const listing = await newListing(ownerId);
      await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "Salut" });

      await createReport(otherId, { reportedUserId: ownerId, listingId: listing.id, reason: "AUTRE" });
      await expect(createReport(otherId, { reportedUserId: ownerId, listingId: listing.id, reason: "VENTE" })).rejects.toThrow(ConflictError);
      await expect(createReport(otherId, { reportedUserId: otherId, listingId: listing.id, reason: "AUTRE" })).rejects.toThrow(ConflictError);
      await expect(createReport(thirdId, { reportedUserId: ownerId, listingId: listing.id, reason: "AUTRE" })).rejects.toThrow(ConflictError);
      await expect(createReport(otherId, { reportedUserId: thirdId, listingId: listing.id, reason: "AUTRE" })).rejects.toThrow(ConflictError);
      await expect(createReport(otherId, { reportedUserId: ownerId, listingId: "inconnue", reason: "AUTRE" })).rejects.toThrow(NotFoundError);
    });
  });

  describe("banniere d'accueil", () => {
    it("countNewListingsSince ne compte jamais les annonces du compte lui-meme", async () => {
      await newListing(ownerId);
      expect(await countNewListingsSince(ownerId)).toBe(0);
    });

    it("compte les annonces ouvertes d'autrui depuis le dernier passage, markCuttingsSeen la remet a zero", async () => {
      await newListing(ownerId, { title: "Hoya", type: "ECHANGE" });
      expect(await countNewListingsSince(otherId)).toBeGreaterThanOrEqual(1);

      await markCuttingsSeen(otherId);
      expect(await countNewListingsSince(otherId)).toBe(0);

      await newListing(ownerId, { title: "Peperomia" });
      expect(await countNewListingsSince(otherId)).toBe(1);
    });
  });
});
