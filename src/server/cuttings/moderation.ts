import { db } from "@/server/db";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { sendEmail } from "@/lib/email";
import { emailShell } from "@/server/emailTemplates";
import {
  BAN_DURATION_MS,
  CUTTING_CONSEQUENCE_LABEL,
  CUTTINGS_NO_SALE_RULE,
  consequenceForRank,
  type CuttingWarningConsequence,
} from "@/server/cuttings/types";

export interface MemberWarning {
  id: string;
  message: string;
  rank: number;
  consequence: CuttingWarningConsequence;
  createdAt: string;
  acknowledgedAt: string | null;
}

function toMemberWarning(w: {
  id: string;
  message: string;
  rank: number;
  consequence: string;
  createdAt: Date;
  acknowledgedAt: Date | null;
}): MemberWarning {
  return {
    id: w.id,
    message: w.message,
    rank: w.rank,
    consequence: w.consequence as CuttingWarningConsequence,
    createdAt: w.createdAt.toISOString(),
    acknowledgedAt: w.acknowledgedAt ? w.acknowledgedAt.toISOString() : null,
  };
}

/** Ce qui se passera au PROCHAIN avertissement de ce membre -- affiche a l'admin avant confirmation. */
export async function previewNextWarning(userId: string): Promise<{ rank: number; consequence: CuttingWarningConsequence }> {
  const rank = (await db.cuttingWarning.count({ where: { userId } })) + 1;
  return { rank, consequence: consequenceForRank(rank) };
}

export interface WarnResult {
  rank: number;
  consequence: CuttingWarningConsequence;
  /** Fin de la suspension du don/echange, si cet avertissement en declenche une (null sinon, y compris pour le ban definitif). */
  bannedUntil: Date | null;
}

/**
 * Avertit un membre (reserve a l'administrateur, verifie par l'appelant).
 * Le rang est le nombre TOTAL d'avertissements recus, tous rapports
 * confondus : 3e = suspension d'une semaine, 6e = un mois, 9e =
 * bannissement definitif de l'app (User.disabledAt, meme mecanisme que la
 * revocation d'un achat rembourse -- la connexion est refusee, les donnees
 * restent). Rang, ecriture et sanction dans une seule transaction : deux
 * avertissements simultanes ne peuvent pas obtenir le meme rang. Le
 * signalement lie, s'il y en a un, est marque traite.
 */
export async function warnMember(
  adminId: string,
  input: { userId: string; message: string; reportId?: string },
): Promise<WarnResult> {
  const target = await db.user.findUnique({ where: { id: input.userId }, select: { id: true, email: true, isAdmin: true, disabledAt: true } });
  if (!target) {
    throw new NotFoundError("Membre introuvable.");
  }
  if (target.isAdmin) {
    throw new ConflictError("Impossible d'avertir un administrateur.");
  }
  if (target.disabledAt) {
    throw new ConflictError("Ce compte est déjà désactivé.");
  }

  const result = await db.$transaction(async (tx) => {
    const rank = (await tx.cuttingWarning.count({ where: { userId: input.userId } })) + 1;
    const consequence = consequenceForRank(rank);
    await tx.cuttingWarning.create({
      data: { userId: input.userId, issuedById: adminId, reportId: input.reportId, message: input.message, rank, consequence },
    });

    let bannedUntil: Date | null = null;
    if (consequence === "BAN_WEEK" || consequence === "BAN_MONTH") {
      bannedUntil = new Date(Date.now() + BAN_DURATION_MS[consequence]);
      await tx.user.update({ where: { id: input.userId }, data: { cuttingsBannedUntil: bannedUntil } });
    } else if (consequence === "BAN_PERMANENT") {
      await tx.user.update({ where: { id: input.userId }, data: { disabledAt: new Date() } });
    }

    if (input.reportId) {
      await tx.cuttingReport.updateMany({ where: { id: input.reportId, status: "OUVERT" }, data: { status: "TRAITE", handledAt: new Date() } });
    }
    return { rank, consequence, bannedUntil };
  });

  await notifyWarnedMember(target.email, input.message, result);
  return result;
}

/** Avertit l'auteur vise par un signalement et classe ce dernier. */
export async function warnFromReport(adminId: string, reportId: string, message: string): Promise<WarnResult> {
  const report = await db.cuttingReport.findUnique({ where: { id: reportId }, select: { reportedUserId: true } });
  if (!report) {
    throw new NotFoundError("Signalement introuvable.");
  }
  return warnMember(adminId, { userId: report.reportedUserId, message, reportId });
}

/**
 * Prevenir par e-mail : indispensable pour un bannissement definitif (le
 * membre ne peut plus se connecter pour voir l'avertissement dans l'app).
 * Best-effort : un e-mail qui echoue n'annule jamais la sanction deja
 * enregistree -- l'avertissement reste visible dans l'app.
 */
async function notifyWarnedMember(email: string, message: string, result: WarnResult): Promise<void> {
  try {
    const consequenceText =
      result.consequence === "NONE"
        ? "Cet avertissement n'entraîne pas de sanction pour l'instant, mais ils s'accumulent : le 3e entraîne une suspension d'une semaine du don/échange de boutures, le 6e d'un mois, le 9e un bannissement définitif de l'application."
        : `${CUTTING_CONSEQUENCE_LABEL[result.consequence]}${result.bannedUntil ? ` (jusqu'au ${result.bannedUntil.toLocaleDateString("fr-BE")})` : ""}.`;
    const subject = "Avertissement — don/échange de boutures Jungly";
    const escaped = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = emailShell(
      `Avertissement n°${result.rank}`,
      `<p style="font-size:0.95rem;line-height:1.6;">L'administrateur de Jungly t'adresse l'avertissement suivant :</p>
       <p style="font-size:0.95rem;line-height:1.6;background:#f4f0e2;border-radius:10px;padding:12px 14px;white-space:pre-line;">${escaped}</p>
       <p style="font-size:0.95rem;line-height:1.6;"><strong>${consequenceText}</strong></p>
       <p style="font-size:0.85rem;line-height:1.6;color:#6f7566;">${CUTTINGS_NO_SALE_RULE}</p>`,
    );
    const text = `Avertissement n°${result.rank} de l'administrateur de Jungly :\n\n${message}\n\n${consequenceText}\n\n${CUTTINGS_NO_SALE_RULE}`;
    await sendEmail(email, subject, html, text);
  } catch (error) {
    console.error("[cuttings] e-mail d'avertissement non envoye :", error);
  }
}

export async function acknowledgeWarning(userId: string, warningId: string): Promise<void> {
  const { count } = await db.cuttingWarning.updateMany({
    where: { id: warningId, userId, acknowledgedAt: null },
    data: { acknowledgedAt: new Date() },
  });
  if (count === 0) {
    throw new NotFoundError("Avertissement introuvable ou déjà acquitté.");
  }
}

export async function listUnacknowledgedWarnings(userId: string): Promise<MemberWarning[]> {
  const rows = await db.cuttingWarning.findMany({ where: { userId, acknowledgedAt: null }, orderBy: { createdAt: "desc" } });
  return rows.map(toMemberWarning);
}

export async function countUnacknowledgedWarnings(userId: string): Promise<number> {
  return db.cuttingWarning.count({ where: { userId, acknowledgedAt: null } });
}

export interface SuspendedMember {
  id: string;
  pseudo: string | null;
  email: string;
  /** null = bannissement definitif de l'app. */
  bannedUntil: string | null;
  permanent: boolean;
  warningCount: number;
}

/** Membres actuellement suspendus (temporairement ou definitivement) POUR AVERTISSEMENTS -- page admin. */
export async function listSuspendedMembers(): Promise<SuspendedMember[]> {
  const now = new Date();
  const users = await db.user.findMany({
    where: {
      OR: [{ cuttingsBannedUntil: { gt: now } }, { cuttingWarnings: { some: { consequence: "BAN_PERMANENT" } }, disabledAt: { not: null } }],
    },
    select: { id: true, pseudo: true, email: true, cuttingsBannedUntil: true, disabledAt: true, _count: { select: { cuttingWarnings: true } } },
  });
  return users.map((u) => {
    const permanent = u.disabledAt !== null;
    return {
      id: u.id,
      pseudo: u.pseudo,
      email: u.email,
      bannedUntil: permanent ? null : (u.cuttingsBannedUntil?.toISOString() ?? null),
      permanent,
      warningCount: u._count.cuttingWarnings,
    };
  });
}

/**
 * Leve une suspension (erreur de jugement, recours accepte) -- ne supprime
 * JAMAIS les avertissements : le compte reste cumulatif, la prochaine
 * sanction dependra toujours du nombre total. Ne reactive un compte
 * desactive QUE s'il l'a ete par un avertissement (jamais un compte
 * desactive pour un achat rembourse).
 */
export async function liftSuspension(userId: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, disabledAt: true } });
  if (!user) {
    throw new NotFoundError("Membre introuvable.");
  }
  const bannedForWarnings = await db.cuttingWarning.findFirst({ where: { userId, consequence: "BAN_PERMANENT" }, select: { id: true } });
  await db.user.update({
    where: { id: userId },
    data: { cuttingsBannedUntil: null, ...(user.disabledAt && bannedForWarnings ? { disabledAt: null } : {}) },
  });
}
