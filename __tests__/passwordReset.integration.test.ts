import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { ConflictError } from "@/lib/errors";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

import { sendEmail } from "@/lib/email";
import { requestPasswordReset, resetPassword } from "@/server/passwordReset";

/**
 * Retour utilisateur (2026-09-18) : aucun moyen de recuperer un compte dont
 * le mot de passe est oublie. Integration reelle (vraie base SQLite), meme
 * pattern que les autres suites du projet.
 */
describe("requestPasswordReset (integration reelle SQLite)", () => {
  let userId: string;
  const email = `test-forgot-${Date.now()}@example.com`;

  beforeAll(async () => {
    const user = await db.user.create({ data: { email, passwordHash: "x" } });
    userId = user.id;
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await db.passwordResetToken.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it("cree un jeton et envoie le mail pour un compte existant", async () => {
    await requestPasswordReset(email);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe(email);

    const tokens = await db.passwordResetToken.findMany({ where: { userId } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].usedAt).toBeNull();
    expect(tokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  // Audit du 2026-09-25 : attendre l'envoi (Resend, plusieurs centaines de
  // ms) rendait la reponse plus lente pour un compte existant -- de quoi
  // deviner quelles adresses ont un compte.
  it("n'attend pas l'envoi du mail (meme temps de reponse qu'une adresse inconnue)", async () => {
    vi.mocked(sendEmail).mockImplementationOnce(() => new Promise<void>(() => {}));
    const outcome = await Promise.race([
      requestPasswordReset(email).then(() => "repondu"),
      new Promise((resolve) => setTimeout(() => resolve("bloque sur l'envoi"), 2000)),
    ]);
    expect(outcome).toBe("repondu");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("ne fait rien et n'envoie aucun mail pour une adresse inconnue (pas de fuite d'information)", async () => {
    await requestPasswordReset(`inconnu-${Date.now()}@example.com`);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("resetPassword (integration reelle SQLite)", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await db.user.create({
      data: { email: `test-reset-${Date.now()}@example.com`, passwordHash: "ancien-hash" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it("met a jour le mot de passe et marque le jeton utilise", async () => {
    const token = await db.passwordResetToken.create({
      data: { userId, token: `tok-ok-${Date.now()}`, expiresAt: new Date(Date.now() + 60_000) },
    });

    await resetPassword(token.token, "nouveau-mot-de-passe-123");

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.passwordHash).not.toBe("ancien-hash");
    // Invalide les sessions JWT deja emises (voir sessionIsCurrent).
    expect(user.sessionVersion).toBe(1);

    const updated = await db.passwordResetToken.findUniqueOrThrow({ where: { id: token.id } });
    expect(updated.usedAt).not.toBeNull();
  });

  it("refuse un jeton expire", async () => {
    const token = await db.passwordResetToken.create({
      data: { userId, token: `tok-expired-${Date.now()}`, expiresAt: new Date(Date.now() - 60_000) },
    });

    await expect(resetPassword(token.token, "un-autre-mot-de-passe")).rejects.toThrow(ConflictError);
  });

  it("refuse un jeton deja utilise (pas de rejeu)", async () => {
    const token = await db.passwordResetToken.create({
      data: { userId, token: `tok-used-${Date.now()}`, expiresAt: new Date(Date.now() + 60_000), usedAt: new Date() },
    });

    await expect(resetPassword(token.token, "un-autre-mot-de-passe")).rejects.toThrow(ConflictError);
  });

  it("refuse un jeton inexistant", async () => {
    await expect(resetPassword("jeton-qui-n-existe-pas", "un-mot-de-passe")).rejects.toThrow(ConflictError);
  });

  it("invalide les autres jetons en attente du meme compte apres une reinitialisation reussie", async () => {
    const usedToken = await db.passwordResetToken.create({
      data: { userId, token: `tok-a-utiliser-${Date.now()}`, expiresAt: new Date(Date.now() + 60_000) },
    });
    const staleToken = await db.passwordResetToken.create({
      data: { userId, token: `tok-perime-${Date.now()}`, expiresAt: new Date(Date.now() + 60_000) },
    });

    await resetPassword(usedToken.token, "encore-un-autre-mot-de-passe");

    const stale = await db.passwordResetToken.findUniqueOrThrow({ where: { id: staleToken.id } });
    expect(stale.usedAt).not.toBeNull();
  });
});
