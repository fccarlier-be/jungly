import { db } from "@/server/db";
import { assertOwnedUpload } from "@/server/uploads";
import { UPLOAD_URL_PATTERN } from "@/server/cuttings/photos";
import { NotFoundError, ForbiddenError, ConflictError, ServiceUnavailableError, BadRequestError } from "@/lib/errors";
import { isCuttingsMarketplaceEnabled } from "@/lib/features";
import { encryptMessageBody, decryptMessageBodyOrPlaceholder } from "@/server/cuttings/crypto";
import { requirePseudo } from "@/server/cuttings/pseudo";
import type {
  CreateCuttingListingInput,
  SendCuttingMessageInput,
  CreateCuttingRatingInput,
} from "@/server/validation/cutting";

/** A appeler en tete de chaque route de ce module -- feature reservee a l'instance hebergee (voir features.ts). */
export function assertCuttingsMarketplaceEnabled(): void {
  if (!isCuttingsMarketplaceEnabled()) {
    throw new ServiceUnavailableError("Le don/échange de boutures n'est pas disponible sur cette instance.");
  }
}

/** Moyenne des notes recues (null tant qu'aucune) et nombre de notes. */
export interface Reputation {
  average: number | null;
  count: number;
}

/** Seul le pseudo est jamais expose aux autres membres -- jamais le nom reel ni l'email. */
export interface CuttingMember {
  id: string;
  pseudo: string | null;
  reputation?: Reputation;
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
  /** Nombre de boutures proposees au total. */
  quantity: number;
  /** Boutures pas encore remises (quantity moins la somme des transactions). */
  remaining: number;
  /** Messages non lus pour l'appelant sur cette annonce (renseigne pour "Mes annonces" et "Messages"). */
  unreadCount?: number;
  /** Dernier message ou l'appelant est partie (renseigne pour "Messages"). */
  lastMessageAt?: string | null;
}

const OWNER_SELECT = { select: { id: true, pseudo: true } } as const;
// Seuls les echanges ACTIFS comptent dans le stock : un echange conteste
// (voir contestTransaction) rend ses boutures a l'annonce.
const LISTING_INCLUDE = { user: OWNER_SELECT, transactions: { where: { status: "ACTIVE" as const }, select: { quantity: true } } } as const;

/**
 * Membre ni suspendu (avertissements, voir moderation.ts) ni banni de l'app :
 * ses annonces restent invisibles des autres et personne ne peut lui ecrire
 * pendant la sanction -- il ne pourrait de toute facon pas repondre.
 */
function activeMemberWhere() {
  return { disabledAt: null, OR: [{ cuttingsBannedUntil: null }, { cuttingsBannedUntil: { lte: new Date() } }] };
}

/** Une seule requete pour la reputation de plusieurs membres (moyenne + nombre de notes recues). */
export async function getReputations(userIds: string[]): Promise<Map<string, Reputation>> {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return new Map();
  const groups = await db.cuttingRating.groupBy({
    by: ["ratedUserId"],
    where: { ratedUserId: { in: unique } },
    _avg: { score: true },
    _count: { _all: true },
  });
  const map = new Map<string, Reputation>(unique.map((id) => [id, { average: null, count: 0 }]));
  for (const g of groups) {
    map.set(g.ratedUserId, { average: g._avg.score, count: g._count._all });
  }
  return map;
}

function toSummary(listing: {
  id: string;
  title: string;
  species: string | null;
  type: string;
  status: string;
  photoUrls: unknown;
  createdAt: Date;
  quantity: number;
  user: CuttingMember;
  transactions: Array<{ quantity: number }>;
}): CuttingListingSummary {
  const given = listing.transactions.reduce((sum, t) => sum + t.quantity, 0);
  return {
    id: listing.id,
    title: listing.title,
    species: listing.species,
    type: listing.type,
    status: listing.status,
    photoUrls: (listing.photoUrls as string[] | null) ?? [],
    createdAt: listing.createdAt.toISOString(),
    owner: listing.user,
    quantity: listing.quantity,
    remaining: Math.max(0, listing.quantity - given),
  };
}

async function withOwnerReputations<T extends CuttingListingSummary>(summaries: T[]): Promise<T[]> {
  const reputations = await getReputations(summaries.map((s) => s.owner.id));
  return summaries.map((s) => ({ ...s, owner: { ...s.owner, reputation: reputations.get(s.owner.id) } }));
}

/** Annonces ouvertes de TOUS les comptes (y compris les siennes propres, affichees a part cote UI) -- tri par recence. */
export async function listOpenListings(): Promise<CuttingListingSummary[]> {
  const listings = await db.cuttingListing.findMany({
    where: { status: "OUVERTE", user: activeMemberWhere() },
    include: LISTING_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return withOwnerReputations(listings.map(toSummary));
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
    db.cuttingListing.findMany({ where: { userId }, include: LISTING_INCLUDE, orderBy: { createdAt: "desc" } }),
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
    include: LISTING_INCLUDE,
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
    // Televersement de CE compte uniquement : assertOwnedUpload() laisse
    // passer toute URL hors /uploads/ (bibliotheque, source externe --
    // legitime pour une plante, visible de son seul proprietaire). Ici la
    // photo est affichee a TOUS les membres : une URL externe leur faisait
    // charger une image d'un serveur tiers (fuite de leur IP, pistage), et
    // n'importe quelle chaine contournait la photo obligatoire (audit du
    // 2026-09-25).
    if (!UPLOAD_URL_PATTERN.test(url)) {
      throw new BadRequestError("Photo invalide : ajoute une photo depuis ton appareil.");
    }
    await assertOwnedUpload(userId, url);
  }
  const listing = await db.cuttingListing.create({
    data: {
      userId,
      title: input.title,
      species: input.species,
      description: input.description,
      type: input.type,
      quantity: input.quantity,
      photoUrls: input.photoUrls,
    },
    include: LISTING_INCLUDE,
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

/**
 * Un echange REALISE (voir CuttingTransaction), vu par l'un de ses deux
 * participants : `counterpart` est toujours l'AUTRE personne.
 */
export interface CuttingTransactionData {
  id: string;
  listingId: string;
  listingTitle: string;
  quantity: number;
  /** CONTESTEE : le destinataire affirme que l'echange n'a pas eu lieu -- plus de notes possibles. */
  status: "ACTIVE" | "CONTESTEE";
  createdAt: string;
  iAmOwner: boolean;
  counterpart: CuttingMember;
  myRating: { score: number; comment: string | null } | null;
  counterpartRating: { score: number; comment: string | null } | null;
}

export interface CuttingListingDetail extends CuttingListingSummary {
  description: string | null;
  /** Uniquement les messages ou l'appelant est expediteur OU destinataire -- jamais les fils des autres. */
  messages: CuttingMessageData[];
  /** Membres (hors proprietaire) ayant ecrit sur cette annonce, le plus recent d'abord -- rempli uniquement cote proprietaire. */
  participants: CuttingParticipant[];
  /** Cote demandeur : messages du proprietaire pas encore lus. */
  unreadFromOwner: number;
  /** Echanges de cette annonce : tous pour le proprietaire, uniquement les siens pour un demandeur. */
  transactions: CuttingTransactionData[];
}

const TRANSACTION_INCLUDE = {
  listing: { select: { id: true, title: true, userId: true, user: OWNER_SELECT } },
  recipient: OWNER_SELECT,
  ratings: true,
} as const;

type TransactionRow = {
  id: string;
  listingId: string;
  quantity: number;
  status: string;
  createdAt: Date;
  recipientId: string;
  listing: { id: string; title: string; userId: string; user: CuttingMember };
  recipient: CuttingMember;
  ratings: Array<{ raterId: string; score: number; comment: string | null }>;
};

async function toTransactionData(userId: string, rows: TransactionRow[]): Promise<CuttingTransactionData[]> {
  const counterparts = rows.map((r) => (r.listing.userId === userId ? r.recipient : r.listing.user));
  const reputations = await getReputations(counterparts.map((c) => c.id));
  return rows.map((r, i) => {
    const iAmOwner = r.listing.userId === userId;
    const counterpart = counterparts[i];
    const mine = r.ratings.find((x) => x.raterId === userId) ?? null;
    const theirs = r.ratings.find((x) => x.raterId !== userId) ?? null;
    return {
      id: r.id,
      listingId: r.listingId,
      listingTitle: r.listing.title,
      quantity: r.quantity,
      status: r.status === "CONTESTEE" ? "CONTESTEE" : "ACTIVE",
      createdAt: r.createdAt.toISOString(),
      iAmOwner,
      counterpart: { ...counterpart, reputation: reputations.get(counterpart.id) },
      myRating: mine ? { score: mine.score, comment: mine.comment } : null,
      counterpartRating: theirs ? { score: theirs.score, comment: theirs.comment } : null,
    };
  });
}

/** Tous les echanges de l'appelant (en tant que proprietaire OU destinataire), les plus recents d'abord. */
export async function listMyTransactions(userId: string): Promise<CuttingTransactionData[]> {
  const rows = await db.cuttingTransaction.findMany({
    where: { OR: [{ recipientId: userId }, { listing: { userId } }] },
    include: TRANSACTION_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return toTransactionData(userId, rows);
}

/** Echanges a noter : ou l'appelant est partie et n'a pas encore laisse sa note. */
export async function countRatingsToGive(userId: string): Promise<number> {
  return db.cuttingTransaction.count({
    where: { status: "ACTIVE", OR: [{ recipientId: userId }, { listing: { userId } }], ratings: { none: { raterId: userId } } },
  });
}

export async function getListingDetail(listingId: string, userId: string): Promise<CuttingListingDetail> {
  const listing = await db.cuttingListing.findUnique({
    where: { id: listingId },
    include: LISTING_INCLUDE,
  });
  if (!listing) {
    throw new NotFoundError("Annonce introuvable.");
  }

  const rawMessages = await db.cuttingMessage.findMany({
    where: { listingId, OR: [{ senderId: userId }, { recipientId: userId }] },
    // id en second critere : deux messages dans la meme milliseconde (test,
    // envoi rapide) gardent quand meme un ordre stable (cuid croissant).
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { sender: { select: { pseudo: true } } },
  });
  const messages: CuttingMessageData[] = rawMessages.map((m) => ({
    id: m.id,
    senderId: m.senderId,
    senderPseudo: m.sender.pseudo,
    recipientId: m.recipientId,
    body: decryptMessageBodyOrPlaceholder({ ciphertext: m.bodyCiphertext, iv: m.bodyIv, authTag: m.bodyAuthTag }),
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
      const ids = Array.from(others.keys());
      const [users, reputations] = await Promise.all([
        db.user.findMany({ where: { id: { in: ids } }, select: { id: true, pseudo: true } }),
        getReputations(ids),
      ]);
      participants = users
        .map((u) => ({ id: u.id, pseudo: u.pseudo, reputation: reputations.get(u.id), ...others.get(u.id)! }))
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    }
  }

  const unreadFromOwner = isOwner
    ? 0
    : rawMessages.filter((m) => m.senderId === listing.userId && m.recipientId === userId && m.readAt === null).length;

  const transactionRows = await db.cuttingTransaction.findMany({
    where: { listingId, ...(isOwner ? {} : { recipientId: userId }) },
    include: TRANSACTION_INCLUDE,
    orderBy: { createdAt: "asc" },
  });

  const [summary] = await withOwnerReputations([toSummary(listing)]);
  return {
    ...summary,
    description: listing.description,
    messages,
    participants,
    unreadFromOwner,
    transactions: await toTransactionData(userId, transactionRows),
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

  const recipient = await db.user.findUnique({ where: { id: input.recipientId }, select: { id: true, disabledAt: true, cuttingsBannedUntil: true } });
  if (!recipient) {
    throw new NotFoundError("Destinataire introuvable.");
  }
  if (recipient.disabledAt || (recipient.cuttingsBannedUntil && recipient.cuttingsBannedUntil.getTime() > Date.now())) {
    throw new ConflictError("Ce membre est actuellement suspendu, il ne peut pas recevoir de message.");
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

/**
 * Retire l'annonce : ANNULEE si aucune bouture n'a encore ete remise, sinon
 * TERMINEE (les echanges deja realises et leurs notes restent intacts, seul
 * le stock restant n'est plus propose).
 */
export async function cancelListing(userId: string, listingId: string): Promise<void> {
  const listing = await db.cuttingListing.findUnique({
    where: { id: listingId },
    include: { transactions: { where: { status: "ACTIVE" }, select: { id: true } } },
  });
  if (!listing) {
    throw new NotFoundError("Annonce introuvable.");
  }
  if (listing.userId !== userId) {
    throw new ForbiddenError("Seul le propriétaire peut retirer cette annonce.");
  }
  if (listing.status !== "OUVERTE") {
    throw new ConflictError("Seule une annonce ouverte peut être retirée.");
  }
  await db.cuttingListing.update({
    where: { id: listingId },
    data: { status: listing.transactions.length > 0 ? "TERMINEE" : "ANNULEE", retiredAt: new Date() },
  });
}

/**
 * Enregistre qu'`quantity` boutures ont ete remises a `recipientId` -- appele
 * APRES la confirmation explicite du proprietaire dans l'UI ("la transaction
 * avec X a-t-elle bien eu lieu ?"). Le destinataire doit deja avoir echange
 * avec le proprietaire sur cette annonce. Verification du stock et ecriture
 * dans une meme transaction : deux enregistrements simultanes ne peuvent pas,
 * a eux deux, depasser la quantite proposee. L'annonce passe TERMINEE
 * quand le stock tombe a 0.
 */
export async function recordTransaction(
  ownerId: string,
  listingId: string,
  input: { recipientId: string; quantity: number },
): Promise<void> {
  await db.$transaction(async (tx) => {
    const listing = await tx.cuttingListing.findUnique({
      where: { id: listingId },
      include: { transactions: { where: { status: "ACTIVE" }, select: { quantity: true } } },
    });
    if (!listing) {
      throw new NotFoundError("Annonce introuvable.");
    }
    if (listing.userId !== ownerId) {
      throw new ForbiddenError("Seul le propriétaire peut enregistrer un échange.");
    }
    if (listing.status !== "OUVERTE") {
      throw new ConflictError("Cette annonce n'est plus ouverte.");
    }
    if (input.recipientId === ownerId) {
      throw new ConflictError("Impossible d'enregistrer un échange avec soi-même.");
    }
    const hasExchanged = await tx.cuttingMessage.findFirst({
      where: { listingId, OR: [{ senderId: input.recipientId }, { recipientId: input.recipientId }] },
      select: { id: true },
    });
    if (!hasExchanged) {
      throw new ConflictError("Ce compte n'a pas échangé de message sur cette annonce.");
    }

    const remaining = listing.quantity - listing.transactions.reduce((sum, t) => sum + t.quantity, 0);
    if (input.quantity > remaining) {
      throw new ConflictError(`Il ne reste que ${remaining} bouture${remaining > 1 ? "s" : ""} sur cette annonce.`);
    }

    await tx.cuttingTransaction.create({ data: { listingId, recipientId: input.recipientId, quantity: input.quantity } });
    if (input.quantity === remaining) {
      await tx.cuttingListing.update({ where: { id: listingId }, data: { status: "TERMINEE" } });
    }
  });
}

/**
 * Reserve aux deux participants d'une transaction (le proprietaire de
 * l'annonce et son destinataire) -- l'un note l'autre, une seule fois par
 * transaction (contrainte unique transactionId+raterId cote schema).
 */
export async function createRating(raterId: string, transactionId: string, input: CreateCuttingRatingInput): Promise<void> {
  const transaction = await db.cuttingTransaction.findUnique({
    where: { id: transactionId },
    include: { listing: { select: { userId: true } } },
  });
  if (!transaction) {
    throw new NotFoundError("Échange introuvable.");
  }
  if (transaction.status === "CONTESTEE") {
    throw new ConflictError("Cet échange a été contesté, il ne peut plus être noté.");
  }

  let ratedUserId: string;
  if (raterId === transaction.listing.userId) {
    ratedUserId = transaction.recipientId;
  } else if (raterId === transaction.recipientId) {
    ratedUserId = transaction.listing.userId;
  } else {
    throw new ForbiddenError("Seuls les deux participants à cet échange peuvent se noter.");
  }

  const existing = await db.cuttingRating.findUnique({ where: { transactionId_raterId: { transactionId, raterId } } });
  if (existing) {
    throw new ConflictError("Tu as déjà noté cet échange.");
  }

  await db.cuttingRating.create({
    data: { transactionId, raterId, ratedUserId, score: input.score, comment: input.comment },
  });
}

/**
 * Le DESTINATAIRE conteste un echange enregistre a tort (mauvaise personne
 * selectionnee, echange qui n'a pas eu lieu). Effets : l'echange passe
 * CONTESTEE (conserve pour la trace), les boutures retournent au stock de
 * l'annonce -- qui se rouvre si elle n'avait ete terminee QUE par
 * epuisement du stock, pas retiree a la main --, et les notes deja laissees
 * sur cet echange sont effacees. Refuse si le destinataire l'a lui-meme deja
 * note : noter, c'est reconnaitre que l'echange a eu lieu (sans cette
 * regle, on pourrait noter puis contester pour effacer la note recue).
 */
export async function contestTransaction(userId: string, transactionId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const transaction = await tx.cuttingTransaction.findUnique({
      where: { id: transactionId },
      include: { listing: { select: { id: true, status: true, retiredAt: true } }, ratings: { select: { raterId: true } } },
    });
    if (!transaction) {
      throw new NotFoundError("Échange introuvable.");
    }
    if (transaction.recipientId !== userId) {
      throw new ForbiddenError("Seul le destinataire de l'échange peut le contester.");
    }
    if (transaction.status === "CONTESTEE") {
      throw new ConflictError("Cet échange a déjà été contesté.");
    }
    if (transaction.ratings.some((r) => r.raterId === userId)) {
      throw new ConflictError("Tu as déjà noté cet échange, il ne peut plus être contesté.");
    }

    await tx.cuttingRating.deleteMany({ where: { transactionId } });
    await tx.cuttingTransaction.update({ where: { id: transactionId }, data: { status: "CONTESTEE", contestedAt: new Date() } });
    if (transaction.listing.status === "TERMINEE" && transaction.listing.retiredAt === null) {
      await tx.cuttingListing.update({ where: { id: transaction.listing.id }, data: { status: "OUVERTE" } });
    }
  });
}

export interface ReceivedRating {
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
  raterPseudo: string | null;
  listingTitle: string;
}

export interface MemberProfile {
  id: string;
  pseudo: string | null;
  reputation: Reputation;
  /** Nombre d'echanges realises (comme proprietaire ou destinataire). */
  transactionCount: number;
  ratings: ReceivedRating[];
}

/** Profil PUBLIC d'un membre : pseudo, moyenne et commentaires recus -- jamais nom reel ni email. */
export async function getMemberProfile(memberId: string): Promise<MemberProfile> {
  const member = await db.user.findUnique({ where: { id: memberId }, select: { id: true, pseudo: true } });
  if (!member) {
    throw new NotFoundError("Membre introuvable.");
  }
  const [reputations, transactionCount, ratings] = await Promise.all([
    getReputations([memberId]),
    db.cuttingTransaction.count({ where: { status: "ACTIVE", OR: [{ recipientId: memberId }, { listing: { userId: memberId } }] } }),
    db.cuttingRating.findMany({
      where: { ratedUserId: memberId },
      include: { rater: { select: { pseudo: true } }, transaction: { select: { listing: { select: { title: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    id: member.id,
    pseudo: member.pseudo,
    reputation: reputations.get(memberId) ?? { average: null, count: 0 },
    transactionCount,
    ratings: ratings.map((r) => ({
      id: r.id,
      score: r.score,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      raterPseudo: r.rater.pseudo,
      listingTitle: r.transaction.listing.title,
    })),
  };
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
      user: activeMemberWhere(),
      ...(user?.lastSeenCuttingsAt ? { createdAt: { gt: user.lastSeenCuttingsAt } } : {}),
    },
  });
}

export async function markCuttingsSeen(userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { lastSeenCuttingsAt: new Date() } });
}
