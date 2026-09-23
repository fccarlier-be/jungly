import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import {
  sendMessage,
  recordTransaction,
  contestTransaction,
  createRating,
  cancelListing,
  countRatingsToGive,
  getListingDetail,
  getMemberProfile,
  getReputations,
  listMyTransactions,
} from "@/server/cuttings/service";
import { createMember, newListing, deleteMembers } from "./helpers/cuttings";

/** Contestation d'un echange par son destinataire (mauvaise personne selectionnee, echange qui n'a pas eu lieu). */
describe("cuttings : contestation d'un echange (integration reelle SQLite)", () => {
  let ownerId: string;
  let otherId: string;
  let wrongId: string;
  const suffix = Date.now();

  beforeEach(async () => {
    ownerId = await createMember("Vendeur", suffix);
    otherId = await createMember("Acheteur", suffix);
    wrongId = await createMember("Mauvaise", suffix);
  });

  afterEach(async () => {
    await deleteMembers([ownerId, otherId, wrongId]);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function exchange(quantity: number, given: number) {
    const listing = await newListing(ownerId, { quantity });
    await sendMessage(wrongId, listing.id, { recipientId: ownerId, body: "Bonjour" });
    await recordTransaction(ownerId, listing.id, { recipientId: wrongId, quantity: given });
    const [tx] = (await getListingDetail(listing.id, ownerId)).transactions;
    return { listing, tx };
  }

  it("le destinataire conteste : echange CONTESTEE, boutures rendues au stock, annonce rouverte, notes effacees", async () => {
    const { listing, tx } = await exchange(2, 2); // stock epuise -> TERMINEE
    expect((await getListingDetail(listing.id, ownerId)).status).toBe("TERMINEE");
    await createRating(ownerId, tx.id, { score: 1, comment: "Mauvaise personne" });

    await contestTransaction(wrongId, tx.id);

    const detail = await getListingDetail(listing.id, ownerId);
    expect(detail).toMatchObject({ status: "OUVERTE", remaining: 2 });
    expect(detail.transactions).toHaveLength(1);
    expect(detail.transactions[0]).toMatchObject({ status: "CONTESTEE", myRating: null, counterpartRating: null });
    // La mauvaise note laissee au mauvais destinataire a disparu de sa reputation.
    expect((await getReputations([wrongId])).get(wrongId)).toEqual({ average: null, count: 0 });
    expect((await getMemberProfile(wrongId)).transactionCount).toBe(0);
  });

  it("l'echange conteste ne compte plus : ni a noter, ni notable, ni contestable deux fois", async () => {
    const { tx } = await exchange(3, 1);
    expect(await countRatingsToGive(ownerId)).toBe(1);

    await contestTransaction(wrongId, tx.id);

    expect(await countRatingsToGive(ownerId)).toBe(0);
    expect(await countRatingsToGive(wrongId)).toBe(0);
    await expect(createRating(ownerId, tx.id, { score: 5 })).rejects.toThrow(ConflictError);
    await expect(createRating(wrongId, tx.id, { score: 5 })).rejects.toThrow(ConflictError);
    await expect(contestTransaction(wrongId, tx.id)).rejects.toThrow(ConflictError);
    expect((await listMyTransactions(wrongId))[0].status).toBe("CONTESTEE");
  });

  it("seul le destinataire peut contester, et plus une fois qu'il a lui-meme note l'echange", async () => {
    const { tx } = await exchange(2, 1);

    await expect(contestTransaction(ownerId, tx.id)).rejects.toThrow(ForbiddenError);
    await expect(contestTransaction(otherId, tx.id)).rejects.toThrow(ForbiddenError);
    await expect(contestTransaction(wrongId, "inconnu")).rejects.toThrow(NotFoundError);

    await createRating(wrongId, tx.id, { score: 5 });
    await expect(contestTransaction(wrongId, tx.id)).rejects.toThrow(/déjà noté/);
  });

  it("le stock rendu permet un nouvel echange, avec la bonne personne cette fois", async () => {
    const { listing, tx } = await exchange(1, 1);
    await contestTransaction(wrongId, tx.id);

    await sendMessage(otherId, listing.id, { recipientId: ownerId, body: "C'est moi !" });
    await recordTransaction(ownerId, listing.id, { recipientId: otherId, quantity: 1 });

    const detail = await getListingDetail(listing.id, ownerId);
    expect(detail).toMatchObject({ status: "TERMINEE", remaining: 0 });
    expect(detail.transactions.map((t) => t.status).sort()).toEqual(["ACTIVE", "CONTESTEE"]);
  });

  it("une annonce que le proprietaire a RETIREE a la main ne se rouvre pas apres une contestation", async () => {
    const { listing, tx } = await exchange(3, 1);
    await cancelListing(ownerId, listing.id); // retire le reste -> TERMINEE, retiredAt renseigne

    await contestTransaction(wrongId, tx.id);

    expect((await getListingDetail(listing.id, ownerId)).status).toBe("TERMINEE");
  });

  it("une annonce encore ouverte le reste, et un echange conteste ne compte pas pour annuler sans echange", async () => {
    const { listing, tx } = await exchange(3, 1);
    await contestTransaction(wrongId, tx.id);
    expect(await getListingDetail(listing.id, ownerId)).toMatchObject({ status: "OUVERTE", remaining: 3 });

    // Plus aucun echange actif : retirer l'annonce l'ANNULE (et non TERMINEE).
    await cancelListing(ownerId, listing.id);
    expect((await getListingDetail(listing.id, ownerId)).status).toBe("ANNULEE");
  });
});
