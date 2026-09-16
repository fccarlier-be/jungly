import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { NotFoundError, ConflictError } from "@/lib/errors";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

import { sendEmail } from "@/lib/email";
import { resendBetaEmail, sendBetaInvite, listBetaSignupsDetailed } from "@/server/adminPanel";

/**
 * Integration reelle (vraie base SQLite) -- meme pattern que
 * betaSignup.integration.test.ts. Seul sendEmail est mocke (aucun compte
 * Resend en test).
 */
describe("resendBetaEmail (integration reelle SQLite)", () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    vi.clearAllMocks();
    if (createdIds.length) {
      await db.betaSignup.deleteMany({ where: { id: { in: createdIds } } });
      createdIds.length = 0;
    }
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("renvoie le mail de confirmation pour une inscription PENDING", async () => {
    const signup = await db.betaSignup.create({
      data: { email: `resend-pending-${Date.now()}@example.com`, token: `tok-${Date.now()}`, status: "PENDING" },
    });
    createdIds.push(signup.id);

    await resendBetaEmail(signup.id, "confirmation");

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe(signup.email);
  });

  it("refuse de renvoyer une confirmation pour une inscription deja CONFIRMED", async () => {
    const signup = await db.betaSignup.create({
      data: { email: `resend-mismatch-${Date.now()}@example.com`, token: `tok-${Date.now()}`, status: "CONFIRMED", confirmedAt: new Date() },
    });
    createdIds.push(signup.id);

    await expect(resendBetaEmail(signup.id, "confirmation")).rejects.toThrow(ConflictError);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("renvoie le mail de bienvenue pour une inscription CONFIRMED", async () => {
    const signup = await db.betaSignup.create({
      data: { email: `resend-welcome-${Date.now()}@example.com`, token: `tok-${Date.now()}`, status: "CONFIRMED", confirmedAt: new Date() },
    });
    createdIds.push(signup.id);

    await resendBetaEmail(signup.id, "welcome");

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("renvoie le mail de liste d'attente pour une inscription WAITLISTED", async () => {
    const signup = await db.betaSignup.create({
      data: { email: `resend-wait-${Date.now()}@example.com`, token: `tok-${Date.now()}`, status: "WAITLISTED", confirmedAt: new Date() },
    });
    createdIds.push(signup.id);

    await resendBetaEmail(signup.id, "waitlisted");

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("refuse une inscription introuvable", async () => {
    await expect(resendBetaEmail("id-inexistant", "confirmation")).rejects.toThrow(NotFoundError);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("sendBetaInvite (integration reelle SQLite)", () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    vi.clearAllMocks();
    if (createdIds.length) {
      await db.betaSignup.deleteMany({ where: { id: { in: createdIds } } });
      createdIds.length = 0;
    }
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("envoie l'invitation et marque invitedAt pour une inscription CONFIRMED", async () => {
    const signup = await db.betaSignup.create({
      data: { email: `invite-ok-${Date.now()}@example.com`, token: `tok-${Date.now()}`, status: "CONFIRMED", confirmedAt: new Date() },
    });
    createdIds.push(signup.id);

    await sendBetaInvite(signup.id, "https://play.google.com/apps/testing/org.fcold.plantes.twa");

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const updated = await db.betaSignup.findUniqueOrThrow({ where: { id: signup.id } });
    expect(updated.invitedAt).not.toBeNull();
  });

  it("permet de renvoyer une invitation deja envoyee (pas de garde bloquante)", async () => {
    const signup = await db.betaSignup.create({
      data: {
        email: `invite-again-${Date.now()}@example.com`,
        token: `tok-${Date.now()}`,
        status: "CONFIRMED",
        confirmedAt: new Date(),
        invitedAt: new Date(Date.now() - 86_400_000),
      },
    });
    createdIds.push(signup.id);

    await sendBetaInvite(signup.id, "https://play.google.com/apps/testing/org.fcold.plantes.twa");

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("refuse une inscription qui n'est pas CONFIRMED", async () => {
    const signup = await db.betaSignup.create({
      data: { email: `invite-pending-${Date.now()}@example.com`, token: `tok-${Date.now()}`, status: "PENDING" },
    });
    createdIds.push(signup.id);

    await expect(
      sendBetaInvite(signup.id, "https://play.google.com/apps/testing/org.fcold.plantes.twa"),
    ).rejects.toThrow(ConflictError);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuse une inscription introuvable", async () => {
    await expect(
      sendBetaInvite("id-inexistant", "https://play.google.com/apps/testing/org.fcold.plantes.twa"),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("listBetaSignupsDetailed (integration reelle SQLite)", () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    if (createdIds.length) {
      await db.betaSignup.deleteMany({ where: { id: { in: createdIds } } });
      createdIds.length = 0;
    }
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("inclut invitedAt dans la liste", async () => {
    const signup = await db.betaSignup.create({
      data: {
        email: `list-${Date.now()}@example.com`,
        token: `tok-${Date.now()}`,
        status: "CONFIRMED",
        confirmedAt: new Date(),
        invitedAt: new Date(),
      },
    });
    createdIds.push(signup.id);

    const rows = await listBetaSignupsDetailed();
    const found = rows.find((r) => r.id === signup.id);
    expect(found?.invitedAt).not.toBeNull();
  });
});
