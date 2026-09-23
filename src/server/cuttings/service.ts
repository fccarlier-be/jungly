import { db } from "@/server/db";
import { assertOwnedUpload } from "@/server/uploads";
import { NotFoundError, ForbiddenError, ConflictError, ServiceUnavailableError } from "@/lib/errors";
import { isCuttingsMarketplaceEnabled } from "@/lib/features";
import { encryptMessageBody, decryptMessageBody } from "@/server/cuttings/crypto";
import type { CreateCuttingListingInput, SendCuttingMessageInput, CreateCuttingRatingInput } from "@/server/validation/cutting";

/** A appeler en tete de chaque route de ce module -- feature reservee a l'instance hebergee (voir features.ts). */
export function assertCuttingsMarketplaceEnabled(): void {
  if (!isCuttingsMarketplaceEnabled()) {
    throw new ServiceUnavailableError("Le don/échange de boutures n'est pas disponible sur cette instance.");
  }
}

export interface CuttingListingSummary {
  id: string;
  title: string;
  species: string | null;
  type: string;
  status: string;
  photoUrls: string[];
  createdAt: string;
  owner: { id: string; name: string | null };
}

function toSummary(listing: {
  id: string;
  title: string;
  species: string | null;
  type: string;
  status: string;
  photoUrls: unknown;
  createdAt: Date;
  user: { id: string; name: string | null };
}): CuttingListingSummary {
  return {
    id: listing.id,
    title: listing.title,
    species: listing.species,
    type: listing.type,
    status: listing.status,
    photoUrls: (listing.photoUrls as string[] | null) ?? [],
    createdAt: listing.createdAt.toISOString(),
    owner: listing.user,
  };
}

/** Annonces ouvertes de TOUS les comptes (y compris les siennes propres, affichees a part cote UI) -- tri par recence. */
export async function listOpenListings(): Promise<CuttingListingSummary[]> {
  const listings = await db.cuttingListing.findMany({
    where: { status: "OUVERTE" },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return listings.map(toSummary);
}

export async function listMyListings(userId: string): Promise<CuttingListingSummary[]> {
  const listings = await db.cuttingListing.findMany({
    where: { userId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return listings.map(toSummary);
}

export async function createListing(userId: string, input: CreateCuttingListingInput): Promise<CuttingListingSummary> {
  for (const url of input.photoUrls) {
    await assertOwnedUpload(userId, url);
  }
  const listing = await db.cuttingListing.create({
    data: {
      userId,
      title: input.title,
      species: input.species,
      description: input.description,
      type: input.type,
      photoUrls: input.photoUrls,
    },
    include: { user: { select: { id: true, name: true } } },
  });
  return toSummary(listing);
}

export interface CuttingMessageData {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
}

export interface CuttingListingDetail extends CuttingListingSummary {
  description: string | null;
  completedWithUserId: string | null;
  /** Uniquement les messages ou l'appelant est expediteur OU destinataire -- jamais les fils des autres. */
  messages: CuttingMessageData[];
  /** Comptes (hors proprietaire) ayant echange sur cette annonce -- rempli uniquement cote proprietaire, pour choisir avec qui il a finalise. */
  participants: Array<{ id: string; name: string | null }>;
  myRating: { score: number; comment: string | null } | null;
  counterpartRating: { score: number; comment: string | null } | null;
}

export async function getListingDetail(listingId: string, userId: string): Promise<CuttingListingDetail> {
  const listing = await db.cuttingListing.findUnique({
    where: { id: listingId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!listing) {
    throw new NotFoundError("Annonce introuvable.");
  }

  const rawMessages = await db.cuttingMessage.findMany({
    where: { listingId, OR: [{ senderId: userId }, { recipientId: userId }] },
    orderBy: { createdAt: "asc" },
  });
  const messages = rawMessages.map((m) => ({
    id: m.id,
    senderId: m.senderId,
    recipientId: m.recipientId,
    body: decryptMessageBody({ ciphertext: m.bodyCiphertext, iv: m.bodyIv, authTag: m.bodyAuthTag }),
    createdAt: m.createdAt.toISOString(),
  }));

  let participants: Array<{ id: string; name: string | null }> = [];
  if (listing.userId === userId) {
    const all = await db.cuttingMessage.findMany({ where: { listingId }, select: { senderId: true, recipientId: true } });
    const ids = Array.from(new Set(all.flatMap((m) => [m.senderId, m.recipientId]).filter((id) => id !== userId)));
    if (ids.length > 0) {
      participants = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    }
  }

  const ratings = await db.cuttingRating.findMany({ where: { listingId } });
  const myRating = ratings.find((r) => r.raterId === userId) ?? null;
  const counterpartRating = ratings.find((r) => r.raterId !== userId && r.ratedUserId === userId) ?? null;

  return {
    ...toSummary(listing),
    description: listing.description,
    completedWithUserId: listing.completedWithUserId,
    messages,
    participants,
    myRating: myRating ? { score: myRating.score, comment: myRating.comment } : null,
    counterpartRating: counterpartRating ? { score: counterpartRating.score, comment: counterpartRating.comment } : null,
  };
}

/**
 * Un correspondant valide pour un envoi est : le proprietaire de l'annonce
 * (n'importe qui peut l'initier), OU quelqu'un ayant deja echange sur cette
 * annonce (le proprietaire peut repondre a qui lui a deja ecrit) -- jamais
 * un tiers arbitraire que le proprietaire n'a jamais vu.
 */
export async function sendMessage(senderId: string, listingId: string, input: SendCuttingMessageInput): Promise<void> {
  const listing = await db.cuttingListing.findUnique({ where: { id: listingId } });
  if (!listing) {
    throw new NotFoundError("Annonce introuvable.");
  }
  if (listing.status === "ANNULEE") {
    throw new ConflictError("Cette annonce a été annulée.");
  }
  if (input.recipientId === senderId) {
    throw new ConflictError("Impossible de s'envoyer un message à soi-même.");
  }

  const recipientIsOwner = input.recipientId === listing.userId;
  const senderIsOwner = senderId === listing.userId;
  if (!recipientIsOwner && !senderIsOwner) {
    throw new ForbiddenError("Ce destinataire n'est pas rattaché à cette annonce.");
  }
  if (senderIsOwner) {
    const alreadyExchanged = await db.cuttingMessage.findFirst({
      where: { listingId, OR: [{ senderId: input.recipientId }, { recipientId: input.recipientId }] },
    });
    if (!alreadyExchanged) {
      throw new ForbiddenError("Ce compte n'a pas encore engagé de conversation sur cette annonce.");
    }
  }

  const recipient = await db.user.findUnique({ where: { id: input.recipientId }, select: { id: true } });
  if (!recipient) {
    throw new NotFoundError("Destinataire introuvable.");
  }

  const encrypted = encryptMessageBody(input.body);
  await db.cuttingMessage.create({
    data: {
      listingId,
      senderId,
      recipientId: input.recipientId,
      bodyCiphertext: encrypted.ciphertext,
      bodyIv: encrypted.iv,
      bodyAuthTag: encrypted.authTag,
    },
  });
}

export async function cancelListing(userId: string, listingId: string): Promise<void> {
  const listing = await db.cuttingListing.findUnique({ where: { id: listingId } });
  if (!listing) {
    throw new NotFoundError("Annonce introuvable.");
  }
  if (listing.userId !== userId) {
    throw new ForbiddenError("Seul le propriétaire peut annuler cette annonce.");
  }
  if (listing.status !== "OUVERTE") {
    throw new ConflictError("Seule une annonce ouverte peut être annulée.");
  }
  await db.cuttingListing.update({ where: { id: listingId }, data: { status: "ANNULEE" } });
}

/**
 * Cloture l'annonce avec le compte choisi comme destinataire final --
 * n'importe qui ayant deja echange avec le proprietaire (voir
 * participants ci-dessus), pas necessairement le premier a avoir ecrit.
 */
export async function completeListing(userId: string, listingId: string, completedWithUserId: string): Promise<void> {
  const listing = await db.cuttingListing.findUnique({ where: { id: listingId } });
  if (!listing) {
    throw new NotFoundError("Annonce introuvable.");
  }
  if (listing.userId !== userId) {
    throw new ForbiddenError("Seul le propriétaire peut clôturer cette annonce.");
  }
  if (listing.status !== "OUVERTE") {
    throw new ConflictError("Seule une annonce ouverte peut être clôturée.");
  }
  const hasExchanged = await db.cuttingMessage.findFirst({
    where: { listingId, OR: [{ senderId: completedWithUserId }, { recipientId: completedWithUserId }] },
  });
  if (!hasExchanged) {
    throw new ConflictError("Ce compte n'a pas échangé de message sur cette annonce.");
  }
  await db.cuttingListing.update({ where: { id: listingId }, data: { status: "TERMINEE", completedWithUserId } });
}

/**
 * Reserve aux deux participants d'une annonce TERMINEE (le proprietaire et
 * completedWithUserId) -- l'un note l'autre, jamais l'inverse pour le meme
 * appelant (contrainte unique listingId+raterId cote schema).
 */
export async function createRating(raterId: string, listingId: string, input: CreateCuttingRatingInput): Promise<void> {
  const listing = await db.cuttingListing.findUnique({ where: { id: listingId } });
  if (!listing) {
    throw new NotFoundError("Annonce introuvable.");
  }
  if (listing.status !== "TERMINEE" || !listing.completedWithUserId) {
    throw new ConflictError("Cette annonce n'est pas encore terminée.");
  }

  let ratedUserId: string;
  if (raterId === listing.userId) {
    ratedUserId = listing.completedWithUserId;
  } else if (raterId === listing.completedWithUserId) {
    ratedUserId = listing.userId;
  } else {
    throw new ForbiddenError("Seuls les deux participants à cet échange peuvent se noter.");
  }

  const existing = await db.cuttingRating.findUnique({ where: { listingId_raterId: { listingId, raterId } } });
  if (existing) {
    throw new ConflictError("Vous avez déjà noté cet échange.");
  }

  await db.cuttingRating.create({
    data: { listingId, raterId, ratedUserId, score: input.score, comment: input.comment },
  });
}

/**
 * Donnees de la banniere d'accueil : nombre d'annonces OUVERTES publiees par
 * d'AUTRES comptes depuis le dernier passage (User.lastSeenCuttingsAt) --
 * jamais ses propres annonces, ni celles deja vues.
 */
export async function countNewListingsSince(userId: string): Promise<number> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { lastSeenCuttingsAt: true } });
  return db.cuttingListing.count({
    where: {
      status: "OUVERTE",
      userId: { not: userId },
      ...(user?.lastSeenCuttingsAt ? { createdAt: { gt: user.lastSeenCuttingsAt } } : {}),
    },
  });
}

export async function markCuttingsSeen(userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { lastSeenCuttingsAt: new Date() } });
}
