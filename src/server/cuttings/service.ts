import { db } from "@/server/db";
import { assertOwnedUpload } from "@/server/uploads";
import { NotFoundError, ForbiddenError, ConflictError, ServiceUnavailableError } from "@/lib/errors";
import { isCuttingsMarketplaceEnabled } from "@/lib/features";
import { encryptMessageBody, decryptMessageBody } from "@/server/cuttings/crypto";
import { requirePseudo } from "@/server/cuttings/pseudo";
import type { CreateCuttingListingInput, SendCuttingMessageInput, CreateCuttingRatingInput } from "@/server/validation/cutting";

/** A appeler en tete de chaque route de ce module -- feature reservee a l'instance hebergee (voir features.ts). */
export function assertCuttingsMarketplaceEnabled(): void {
  if (!isCuttingsMarketplaceEnabled()) {
    throw new ServiceUnavailableError("Le don/échange de boutures n'est pas disponible sur cette instance.");
  }
}

/** Seul le pseudo est jamais expose aux autres membres -- jamais le nom reel ni l'email. */
export interface CuttingMember {
  id: string;
  pseudo: string | null;
}

export interface CuttingListingSummary {
  id: string;
  title: string;
  species: string | null;
  type: string;
  status: string;
  photoUrls: string[];
  createdAt: string;
  owner: CuttingMember;
  /** Messages non lus pour l'appelant sur cette annonce (renseigne pour "Mes annonces" et "Messages"). */
  unreadCount?: number;
  /** Dernier message ou l'appelant est partie (renseigne pour "Messages"). */
  lastMessageAt?: string | null;
}

const OWNER_SELECT = { select: { id: true, pseudo: true } } as const;

function toSummary(listing: {
  id: string;
  title: string;
  species: string | null;
  type: string;
  status: string;
  photoUrls: unknown;
  createdAt: Date;
  user: CuttingMember;
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
    include: { user: OWNER_SELECT },
    orderBy: { createdAt: "desc" },
  });
  return listings.map(toSummary);
}

async function unreadCountsByListing(userId: string): Promise<Map<string, number>> {
  const groups = await db.cuttingMessage.groupBy({
    by: ["listingId"],
    where: { recipientId: userId, readAt: null },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.listingId, g._count._all]));
}

export async function listMyListings(userId: string): Promise<CuttingListingSummary[]> {
  const [listings, unread] = await Promise.all([
    db.cuttingListing.findMany({ where: { userId }, include: { user: OWNER_SELECT }, orderBy: { createdAt: "desc" } }),
    unreadCountsByListing(userId),
  ]);
  return listings.map((l) => ({ ...toSummary(l), unreadCount: unread.get(l.id) ?? 0 }));
}

/**
 * Toutes les annonces ou l'appelant est partie a au moins un message -- en
 * tant que proprietaire (quelqu'un lui a ecrit) OU en tant que demandeur
 * (il a ecrit a un autre membre) -- les plus recemment actives d'abord.
 * C'est la vue qui rend les echanges suivables quand plusieurs personnes
 * ecrivent au meme vendeur, ou qu'on contacte plusieurs vendeurs.
 */
export async function listConversationListings(userId: string): Promise<CuttingListingSummary[]> {
  const partyOf = { OR: [{ senderId: userId }, { recipientId: userId }] };
  const [lastByListing, unread] = await Promise.all([
    db.cuttingMessage.groupBy({ by: ["listingId"], where: partyOf, _max: { createdAt: true } }),
    unreadCountsByListing(userId),
  ]);
  if (lastByListing.length === 0) return [];

  const listings = await db.cuttingListing.findMany({
    where: { id: { in: lastByListing.map((g) => g.listingId) } },
    include: { user: OWNER_SELECT },
  });
  const lastAt = new Map(lastByListing.map((g) => [g.listingId, g._max.createdAt]));
  return listings
    .map((l) => ({
      ...toSummary(l),
      unreadCount: unread.get(l.id) ?? 0,
      lastMessageAt: lastAt.get(l.id)?.toISOString() ?? null,
    }))
    .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
}

export async function createListing(userId: string, input: CreateCuttingListingInput): Promise<CuttingListingSummary> {
  await requirePseudo(userId);
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
    include: { user: OWNER_SELECT },
  });
  return toSummary(listing);
}

export interface CuttingMessageData {
  id: string;
  senderId: string;
  senderPseudo: string | null;
  recipientId: string;
  body: string;
  createdAt: string;
}

export interface CuttingParticipant extends CuttingMember {
  /** Messages de ce membre que l'appelant (proprietaire) n'a pas encore lus. */
  unreadCount: number;
  lastMessageAt: string;
}

export interface CuttingListingDetail extends CuttingListingSummary {
  description: string | null;
  completedWithUserId: string | null;
  /** Uniquement les messages ou l'appelant est expediteur OU destinataire -- jamais les fils des autres. */
  messages: CuttingMessageData[];
  /** Membres (hors proprietaire) ayant ecrit sur cette annonce, le plus recent d'abord -- rempli uniquement cote proprietaire. */
  participants: CuttingParticipant[];
  /** Cote demandeur : messages du proprietaire pas encore lus. */
  unreadFromOwner: number;
  myRating: { score: number; comment: string | null } | null;
  counterpartRating: { score: number; comment: string | null } | null;
}

export async function getListingDetail(listingId: string, userId: string): Promise<CuttingListingDetail> {
  const listing = await db.cuttingListing.findUnique({
    where: { id: listingId },
    include: { user: OWNER_SELECT },
  });
  if (!listing) {
    throw new NotFoundError("Annonce introuvable.");
  }

  const rawMessages = await db.cuttingMessage.findMany({
    where: { listingId, OR: [{ senderId: userId }, { recipientId: userId }] },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { pseudo: true } } },
  });
  const messages: CuttingMessageData[] = rawMessages.map((m) => ({
    id: m.id,
    senderId: m.senderId,
    senderPseudo: m.sender.pseudo,
    recipientId: m.recipientId,
    body: decryptMessageBody({ ciphertext: m.bodyCiphertext, iv: m.bodyIv, authTag: m.bodyAuthTag }),
    createdAt: m.createdAt.toISOString(),
  }));

  const isOwner = listing.userId === userId;

  let participants: CuttingParticipant[] = [];
  if (isOwner) {
    const others = new Map<string, { lastMessageAt: string; unreadCount: number }>();
    for (const m of rawMessages) {
      const otherId = m.senderId === userId ? m.recipientId : m.senderId;
      const entry = others.get(otherId) ?? { lastMessageAt: m.createdAt.toISOString(), unreadCount: 0 };
      entry.lastMessageAt = m.createdAt.toISOString(); // rawMessages est trie par date croissante
      if (m.recipientId === userId && m.readAt === null) entry.unreadCount += 1;
      others.set(otherId, entry);
    }
    if (others.size > 0) {
      const users = await db.user.findMany({ where: { id: { in: Array.from(others.keys()) } }, select: { id: true, pseudo: true } });
      participants = users
        .map((u) => ({ id: u.id, pseudo: u.pseudo, ...others.get(u.id)! }))
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    }
  }

  const unreadFromOwner = isOwner
    ? 0
    : rawMessages.filter((m) => m.senderId === listing.userId && m.recipientId === userId && m.readAt === null).length;

  const ratings = await db.cuttingRating.findMany({ where: { listingId } });
  const myRating = ratings.find((r) => r.raterId === userId) ?? null;
  const counterpartRating = ratings.find((r) => r.raterId !== userId && r.ratedUserId === userId) ?? null;

  return {
    ...toSummary(listing),
    description: listing.description,
    completedWithUserId: listing.completedWithUserId,
    messages,
    participants,
    unreadFromOwner,
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
  await requirePseudo(senderId);
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

/** Marque comme lus les messages recus de `withUserId` sur cette annonce -- appele a l'ouverture du fil correspondant. */
export async function markThreadRead(userId: string, listingId: string, withUserId: string): Promise<void> {
  await db.cuttingMessage.updateMany({
    where: { listingId, recipientId: userId, senderId: withUserId, readAt: null },
    data: { readAt: new Date() },
  });
}

/** Total des messages non lus, toutes annonces confondues -- alimente la banniere d'accueil. */
export async function countUnreadMessages(userId: string): Promise<number> {
  return db.cuttingMessage.count({ where: { recipientId: userId, readAt: null } });
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
