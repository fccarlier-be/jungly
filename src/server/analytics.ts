import { db } from "@/server/db";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AnalyticsSummary {
  pageViews: {
    total: number;
    last7Days: number;
    last30Days: number;
    byPath: { path: string; total: number; last7Days: number; last30Days: number }[];
    dailyLast14: { day: string; count: number }[];
  };
  betaSignups: {
    pending: number;
    confirmed: number;
    waitlisted: number;
    total: number;
    confirmedEmails: { email: string; confirmedAt: string }[];
  };
}

/**
 * `now` est parametrable pour que les tests d'integration puissent poser
 * des PageView a des dates fixes et verifier les fenetres 7/14/30 jours
 * sans dependre de l'horloge reelle au moment ou le test tourne.
 */
export async function getAnalyticsSummary(now: Date = new Date()): Promise<AnalyticsSummary> {
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since14 = new Date(now.getTime() - 14 * DAY_MS);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);

  const [total, last7Days, last30Days, byPathTotal, byPath7, byPath30, dailyRows, pending, confirmed, waitlisted, confirmedRows] =
    await Promise.all([
      db.pageView.count(),
      db.pageView.count({ where: { createdAt: { gte: since7 } } }),
      db.pageView.count({ where: { createdAt: { gte: since30 } } }),
      db.pageView.groupBy({ by: ["path"], _count: { _all: true } }),
      db.pageView.groupBy({ by: ["path"], _count: { _all: true }, where: { createdAt: { gte: since7 } } }),
      db.pageView.groupBy({ by: ["path"], _count: { _all: true }, where: { createdAt: { gte: since30 } } }),
      db.$queryRaw<{ day: string; count: number | bigint }[]>`
        SELECT substr("createdAt", 1, 10) as day, COUNT(*) as count
        FROM "PageView"
        WHERE "createdAt" >= ${since14.toISOString()}
        GROUP BY day
        ORDER BY day ASC
      `,
      db.betaSignup.count({ where: { status: "PENDING" } }),
      db.betaSignup.count({ where: { status: "CONFIRMED" } }),
      db.betaSignup.count({ where: { status: "WAITLISTED" } }),
      db.betaSignup.findMany({
        where: { status: "CONFIRMED" },
        select: { email: true, confirmedAt: true },
        orderBy: { confirmedAt: "desc" },
      }),
    ]);

  const map7 = new Map(byPath7.map((r) => [r.path, r._count._all]));
  const map30 = new Map(byPath30.map((r) => [r.path, r._count._all]));

  const byPath = byPathTotal
    .map((r) => ({
      path: r.path,
      total: r._count._all,
      last7Days: map7.get(r.path) ?? 0,
      last30Days: map30.get(r.path) ?? 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    pageViews: {
      total,
      last7Days,
      last30Days,
      byPath,
      dailyLast14: dailyRows.map((r) => ({ day: r.day, count: Number(r.count) })),
    },
    betaSignups: {
      pending,
      confirmed,
      waitlisted,
      total: pending + confirmed + waitlisted,
      confirmedEmails: confirmedRows.map((r) => ({ email: r.email, confirmedAt: r.confirmedAt!.toISOString() })),
    },
  };
}
