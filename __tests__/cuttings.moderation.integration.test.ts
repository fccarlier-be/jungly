import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

import { sendEmail } from "@/lib/email";
import { CUTTING_CONSEQUENCE_LABEL, DAY_MS, consequenceForRank } from "@/server/cuttings/types";
import { listOpenListings, sendMessage, countNewListingsSince } from "@/server/cuttings/service";
import { createReport, listReports } from "@/server/cuttings/reports";
import { assertCuttingsAccess, getCuttingsBanUntil } from "@/server/cuttings/access";
import {
  warnMember,
  warnFromReport,
  previewNextWarning,
  acknowledgeWarning,
  listUnacknowledgedWarnings,
  countUnacknowledgedWarnings,
  listSuspendedMembers,
  liftSuspension,
} from "@/server/cuttings/moderation";
import { createMember, newListing, deleteMembers } from "./helpers/cuttings";

describe("consequenceForRank (paliers 3 / 6 / 9)", () => {
  it.each([
    [1, "NONE"],
    [2, "NONE"],
    [3, "BAN_WEEK"],
    [4, "NONE"],
    [5, "NONE"],
    [6, "BAN_MONTH"],
    [7, "NONE"],
    [9, "BAN_PERMANENT"],
    [12, "BAN_PERMANENT"],
  ])("avertissement n°%i -> %s", (rank, expected) => {
    expect(consequenceForRank(rank)).toBe(expected);
  });
});

describe("cuttings : avertissements et suspensions (integration reelle SQLite)", () => {
  let adminId: string;
  let memberId: string;
  let otherId: string;
  const suffix = Date.now();

  beforeEach(async () => {
    adminId = await createMember("Admin", suffix, { isAdmin: true });
    memberId = await createMember("Fautif", suffix);
    otherId = await createMember("Victime", suffix);
    vi.mocked(sendEmail).mockClear();
  });

  afterEach(async () => {
    await deleteMembers([adminId, memberId, otherId]);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function warnTimes(times: number) {
    let last;
    for (let i = 0; i < times; i++) {
      last = await warnMember(adminId, { userId: memberId, message: `Avertissement ${i + 1}` });
    }
    return last!;
  }

  it("les deux premiers avertissements n'ont aucune sanction, le 3e suspend une semaine", async () => {
    expect(await previewNextWarning(memberId)).toEqual({ rank: 1, consequence: "NONE" });

    const first = await warnMember(adminId, { userId: memberId, message: "Attention" });
    expect(first).toMatchObject({ rank: 1, consequence: "NONE", bannedUntil: null });
    expect(await getCuttingsBanUntil(memberId)).toBeNull();
    await warnMember(adminId, { userId: memberId, message: "Encore" });
    expect(await previewNextWarning(memberId)).toEqual({ rank: 3, consequence: "BAN_WEEK" });

    const third = await warnMember(adminId, { userId: memberId, message: "Trois" });
    expect(third).toMatchObject({ rank: 3, consequence: "BAN_WEEK" });
    const until = (await getCuttingsBanUntil(memberId))!;
    expect(until.getTime() - Date.now()).toBeGreaterThan(6.9 * DAY_MS);
    expect(until.getTime() - Date.now()).toBeLessThan(7.1 * DAY_MS);
    // Un e-mail part a chaque avertissement.
    expect(sendEmail).toHaveBeenCalledTimes(3);
    expect(vi.mocked(sendEmail).mock.calls[2][0]).toBe(`cutting-Fautif-${suffix}@example.com`);
  });

  it("le 6e avertissement suspend un mois, le 9e bannit definitivement de l'app", async () => {
    await warnTimes(5);
    const sixth = await warnMember(adminId, { userId: memberId, message: "Six" });
    expect(sixth.consequence).toBe("BAN_MONTH");
    const until = (await getCuttingsBanUntil(memberId))!;
    expect(until.getTime() - Date.now()).toBeGreaterThan(29.9 * DAY_MS);

    await warnTimes(2);
    const ninth = await warnMember(adminId, { userId: memberId, message: "Neuf" });
    expect(ninth).toMatchObject({ rank: 9, consequence: "BAN_PERMANENT", bannedUntil: null });
    expect((await db.user.findUniqueOrThrow({ where: { id: memberId } })).disabledAt).not.toBeNull();

    // Compte desactive : plus d'avertissement possible.
    await expect(warnMember(adminId, { userId: memberId, message: "Dix" })).rejects.toThrow(ConflictError);
  });

  it("refuse d'avertir un administrateur ou un membre inconnu", async () => {
    await expect(warnMember(adminId, { userId: adminId, message: "x" })).rejects.toThrow(ConflictError);
    await expect(warnMember(adminId, { userId: "inconnu", message: "x" })).rejects.toThrow(NotFoundError);
  });

  it("pendant la suspension : acces refuse, annonces invisibles, impossible d'ecrire au membre", async () => {
    const listing = await newListing(memberId);
    await sendMessage(otherId, listing.id, { recipientId: memberId, body: "Avant la suspension" });
    expect((await listOpenListings()).some((l) => l.id === listing.id)).toBe(true);

    await warnTimes(3);

    await expect(assertCuttingsAccess(memberId)).rejects.toThrow(ForbiddenError);
    expect((await listOpenListings()).some((l) => l.id === listing.id)).toBe(false);
    await expect(sendMessage(otherId, listing.id, { recipientId: memberId, body: "Toujours la ?" })).rejects.toThrow(/suspendu/);
    await expect(assertCuttingsAccess(otherId)).resolves.toBeUndefined();
  });

  it("une suspension echue ne bloque plus rien", async () => {
    await warnTimes(3);
    await db.user.update({ where: { id: memberId }, data: { cuttingsBannedUntil: new Date(Date.now() - 1000) } });
    await expect(assertCuttingsAccess(memberId)).resolves.toBeUndefined();
    expect(await getCuttingsBanUntil(memberId)).toBeNull();
    expect((await listSuspendedMembers()).some((m) => m.id === memberId)).toBe(false);
  });

  it("un avertissement lie a un signalement le classe, et le signalement affiche le rang suivant", async () => {
    const listing = await newListing(memberId);
    await sendMessage(otherId, listing.id, { recipientId: memberId, body: "Salut" });
    await createReport(otherId, { reportedUserId: memberId, listingId: listing.id, reason: "VENTE" });
    const report = (await listReports()).find((r) => r.reporter.id === otherId)!;
    expect(report).toMatchObject({ status: "OUVERT", reportedWarnings: 0, nextConsequence: "NONE" });

    await warnFromReport(adminId, report.id, "Vente interdite");

    const after = (await listReports()).find((r) => r.id === report.id)!;
    expect(after.status).toBe("TRAITE");
    expect(after.reportedWarnings).toBe(1);
    await expect(warnFromReport(adminId, "inconnu", "x")).rejects.toThrow(NotFoundError);
  });

  it("le membre voit ses avertissements non acquittes, les acquitte, et personne d'autre ne peut le faire", async () => {
    await warnMember(adminId, { userId: memberId, message: "Premier" });
    const [warning] = await listUnacknowledgedWarnings(memberId);
    expect(warning).toMatchObject({ message: "Premier", rank: 1, consequence: "NONE" });
    expect(await countUnacknowledgedWarnings(memberId)).toBe(1);

    await expect(acknowledgeWarning(otherId, warning.id)).rejects.toThrow(NotFoundError);
    await acknowledgeWarning(memberId, warning.id);
    expect(await countUnacknowledgedWarnings(memberId)).toBe(0);
    await expect(acknowledgeWarning(memberId, warning.id)).rejects.toThrow(NotFoundError);
  });

  it("liftSuspension leve une suspension temporaire mais conserve les avertissements", async () => {
    await warnTimes(3);
    expect((await listSuspendedMembers()).find((m) => m.id === memberId)).toMatchObject({ permanent: false, warningCount: 3 });

    await liftSuspension(memberId);

    expect(await getCuttingsBanUntil(memberId)).toBeNull();
    expect(await previewNextWarning(memberId)).toEqual({ rank: 4, consequence: "NONE" });
  });

  it("liftSuspension reactive un compte banni definitivement POUR avertissements, jamais un autre compte desactive", async () => {
    await warnTimes(9);
    expect((await listSuspendedMembers()).find((m) => m.id === memberId)?.permanent).toBe(true);
    await liftSuspension(memberId);
    expect((await db.user.findUniqueOrThrow({ where: { id: memberId } })).disabledAt).toBeNull();

    // Compte desactive pour une autre raison (achat rembourse) : intouche.
    await db.user.update({ where: { id: otherId }, data: { disabledAt: new Date() } });
    await liftSuspension(otherId);
    expect((await db.user.findUniqueOrThrow({ where: { id: otherId } })).disabledAt).not.toBeNull();
  });

  it("les nouvelles annonces d'un membre suspendu ne comptent plus dans la banniere des autres", async () => {
    await newListing(memberId);
    const beforeBan = await countNewListingsSince(otherId);
    expect(beforeBan).toBeGreaterThanOrEqual(1);
    await warnTimes(3);
    expect(await countNewListingsSince(otherId)).toBe(beforeBan - 1);
  });

  it("le libelle de chaque consequence existe", () => {
    for (const c of ["NONE", "BAN_WEEK", "BAN_MONTH", "BAN_PERMANENT"] as const) {
      expect(CUTTING_CONSEQUENCE_LABEL[c].length).toBeGreaterThan(5);
    }
  });
});
