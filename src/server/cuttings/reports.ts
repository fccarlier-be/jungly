import { db } from "@/server/db";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { encryptMessageBody, decryptMessageBody } from "@/server/cuttings/crypto";
import type { CreateCuttingReportInput } from "@/server/validation/cutting";

const EVIDENCE_MESSAGE_LIMIT = 30;

export interface EvidenceMessage {
  from: string;
  at: string;
  body: string;
}

/**
 * Signale un membre a propos d'une annonce (typiquement une tentative de
 * vente, interdite). Les deux comptes doivent etre parties a l'annonce
 * (proprietaire, ou quelqu'un ayant echange dessus) : un signalement n'a de
 * sens que dans le contexte d'un echange reel, jamais pour viser un membre
 * arbitraire. Les derniers messages entre les deux comptes sont captures
 * (chiffres) au moment du signalement -- sans quoi l'administrateur ne
 * pourrait rien verifier, les messages n'etant jamais lisibles depuis l'admin.
 */
export async function createReport(reporterId: string, input: CreateCuttingReportInput): Promise<void> {
  if (input.reportedUserId === reporterId) {
    throw new ConflictError("Tu ne peux pas te signaler toi-même.");
  }
  const listing = await db.cuttingListing.findUnique({ where: { id: input.listingId }, select: { id: true, userId: true } });
  if (!listing) {
    throw new NotFoundError("Annonce introuvable.");
  }

  const isParty = async (userId: string): Promise<boolean> => {
    if (userId === listing.userId) return true;
    const message = await db.cuttingMessage.findFirst({
      where: { listingId: listing.id, OR: [{ senderId: userId }, { recipientId: userId }] },
      select: { id: true },
    });
    return message !== null;
  };
  if (!(await isParty(reporterId)) || !(await isParty(input.reportedUserId))) {
    throw new ConflictError("Ce signalement doit concerner une personne avec qui tu as échangé sur cette annonce.");
  }

  const duplicate = await db.cuttingReport.findFirst({
    where: { reporterId, reportedUserId: input.reportedUserId, listingId: listing.id, status: "OUVERT" },
    select: { id: true },
  });
  if (duplicate) {
    throw new ConflictError("Tu as déjà signalé ce membre pour cette annonce, le signalement est en cours d'examen.");
  }

  const rawMessages = await db.cuttingMessage.findMany({
    where: {
      listingId: listing.id,
      OR: [
        { senderId: reporterId, recipientId: input.reportedUserId },
        { senderId: input.reportedUserId, recipientId: reporterId },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: EVIDENCE_MESSAGE_LIMIT,
    include: { sender: { select: { pseudo: true } } },
  });
  let evidence: { ciphertext: string; iv: string; authTag: string } | null = null;
  if (rawMessages.length > 0) {
    const snapshot: EvidenceMessage[] = rawMessages.reverse().map((m) => ({
      from: m.sender.pseudo ?? "membre sans pseudo",
      at: m.createdAt.toISOString(),
      body: decryptMessageBody({ ciphertext: m.bodyCiphertext, iv: m.bodyIv, authTag: m.bodyAuthTag }),
    }));
    evidence = encryptMessageBody(JSON.stringify(snapshot));
  }

  await db.cuttingReport.create({
    data: {
      reporterId,
      reportedUserId: input.reportedUserId,
      listingId: listing.id,
      reason: input.reason,
      comment: input.comment,
      evidenceCiphertext: evidence?.ciphertext,
      evidenceIv: evidence?.iv,
      evidenceAuthTag: evidence?.authTag,
    },
  });
}

export interface ReportData {
  id: string;
  reason: string;
  comment: string | null;
  status: string;
  createdAt: string;
  handledAt: string | null;
  reporter: { id: string; pseudo: string | null; email: string };
  reported: { id: string; pseudo: string | null; email: string };
  listing: { id: string; title: string } | null;
  evidence: EvidenceMessage[];
  /** Nombre total de signalements deja recus par ce membre (tous statuts) -- repere les recidivistes. */
  reportedTotal: number;
}

/** Reserve a l'administrateur (voir page /admin/signalements) : deja verifie par l'appelant. */
export async function listReports(): Promise<ReportData[]> {
  const rows = await db.cuttingReport.findMany({
    include: {
      reporter: { select: { id: true, pseudo: true, email: true } },
      reportedUser: { select: { id: true, pseudo: true, email: true } },
      listing: { select: { id: true, title: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  const totals = await db.cuttingReport.groupBy({ by: ["reportedUserId"], _count: { _all: true } });
  const totalById = new Map(totals.map((t) => [t.reportedUserId, t._count._all]));

  return rows.map((r) => {
    let evidence: EvidenceMessage[] = [];
    if (r.evidenceCiphertext && r.evidenceIv && r.evidenceAuthTag) {
      try {
        evidence = JSON.parse(
          decryptMessageBody({ ciphertext: r.evidenceCiphertext, iv: r.evidenceIv, authTag: r.evidenceAuthTag }),
        ) as EvidenceMessage[];
      } catch {
        evidence = [];
      }
    }
    return {
      id: r.id,
      reason: r.reason,
      comment: r.comment,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      handledAt: r.handledAt ? r.handledAt.toISOString() : null,
      reporter: r.reporter,
      reported: r.reportedUser,
      listing: r.listing,
      evidence,
      reportedTotal: totalById.get(r.reportedUserId) ?? 1,
    };
  });
}

export async function countOpenReports(): Promise<number> {
  return db.cuttingReport.count({ where: { status: "OUVERT" } });
}

export async function markReportHandled(reportId: string): Promise<void> {
  const { count } = await db.cuttingReport.updateMany({ where: { id: reportId, status: "OUVERT" }, data: { status: "TRAITE", handledAt: new Date() } });
  if (count === 0) {
    throw new NotFoundError("Signalement introuvable ou déjà traité.");
  }
}
