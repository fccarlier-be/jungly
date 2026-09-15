import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getAnalyticsSummary } from "@/server/analytics";

/**
 * Test d'integration reelle (vraie base SQLite, vrai client Prisma) --
 * meme pattern que betaSignup.integration.test.ts. `now` est fixe pour que
 * les fenetres 7/14/30 jours soient deterministes independamment du moment
 * ou le test s'execute reellement.
 */
describe("getAnalyticsSummary (integration reelle SQLite)", () => {
  const NOW = new Date("2026-09-15T12:00:00.000Z");
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

  beforeEach(async () => {
    await db.pageView.deleteMany();
    await db.betaSignup.deleteMany();
  });

  afterAll(async () => {
    await db.pageView.deleteMany();
    await db.betaSignup.deleteMany();
    await db.$disconnect();
  });

  it("compte les vues par fenetre temporelle et par page", async () => {
    await db.pageView.createMany({
      data: [
        { path: "/", createdAt: daysAgo(1) },
        { path: "/", createdAt: daysAgo(1) },
        { path: "/", createdAt: daysAgo(10) },
        { path: "/", createdAt: daysAgo(40) }, // hors des 3 fenetres
        { path: "/installation.html", createdAt: daysAgo(2) },
      ],
    });

    const summary = await getAnalyticsSummary(NOW);

    expect(summary.pageViews.total).toBe(5);
    expect(summary.pageViews.last7Days).toBe(3); // les deux d'hier + installation
    expect(summary.pageViews.last30Days).toBe(4); // tout sauf daysAgo(40)

    const home = summary.pageViews.byPath.find((p) => p.path === "/");
    expect(home).toEqual({ path: "/", total: 4, last7Days: 2, last30Days: 3 });

    const install = summary.pageViews.byPath.find((p) => p.path === "/installation.html");
    expect(install).toEqual({ path: "/installation.html", total: 1, last7Days: 1, last30Days: 1 });
  });

  it("regroupe les vues des 14 derniers jours par jour calendaire", async () => {
    await db.pageView.createMany({
      data: [
        { path: "/", createdAt: daysAgo(0) },
        { path: "/", createdAt: daysAgo(0) },
        { path: "/", createdAt: daysAgo(5) },
        { path: "/", createdAt: daysAgo(20) }, // hors fenetre 14j
      ],
    });

    const summary = await getAnalyticsSummary(NOW);
    const total = summary.pageViews.dailyLast14.reduce((sum, d) => sum + d.count, 0);

    expect(total).toBe(3);
    expect(summary.pageViews.dailyLast14.some((d) => d.day === "2026-09-15" && d.count === 2)).toBe(true);
  });

  it("compte les inscriptions beta par statut", async () => {
    await db.betaSignup.createMany({
      data: [
        { email: "a@example.com", token: "t1", status: "CONFIRMED", confirmedAt: daysAgo(3) },
        { email: "b@example.com", token: "t2", status: "CONFIRMED", confirmedAt: daysAgo(1) },
        { email: "c@example.com", token: "t3", status: "PENDING" },
        { email: "d@example.com", token: "t4", status: "WAITLISTED" },
      ],
    });

    const summary = await getAnalyticsSummary(NOW);

    expect(summary.betaSignups.pending).toBe(1);
    expect(summary.betaSignups.confirmed).toBe(2);
    expect(summary.betaSignups.waitlisted).toBe(1);
    expect(summary.betaSignups.total).toBe(4);
    // Plus recent d'abord.
    expect(summary.betaSignups.confirmedEmails.map((e) => e.email)).toEqual(["b@example.com", "a@example.com"]);
  });

  it("liste les comptes Jungly avec leur nombre de plantes", async () => {
    // Pas de nettoyage/isolation du modele User ici (partage avec d'autres
    // fichiers de test) : on cherche notre propre compte dans la liste
    // plutot que d'affirmer sa taille totale, qui varie selon ce que les
    // autres tests ont deja cree.
    const email = `analytics-account-${Date.now()}@example.com`;
    const user = await db.user.create({ data: { email, passwordHash: "x", name: "Compte de test" } });
    await db.plant.createMany({
      data: [
        { userId: user.id, name: "Plante 1" },
        { userId: user.id, name: "Plante 2" },
      ],
    });

    try {
      const summary = await getAnalyticsSummary(NOW);
      const account = summary.accounts.find((a) => a.email === email);

      expect(account).toEqual({ email, name: "Compte de test", createdAt: user.createdAt.toISOString(), isAdmin: false, plantCount: 2 });
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });
});
