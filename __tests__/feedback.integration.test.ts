import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

import { sendEmail } from "@/lib/email";
import { createFeedback } from "@/server/feedback";
import { listFeedbackDetailed } from "@/server/adminPanel";

/**
 * Retour utilisateur (2026-09-20) : formulaire de feedback beta-testeur,
 * avec option d'envoi anonyme (userId nullable sur Feedback). Integration
 * reelle (vraie base SQLite), meme pattern que passwordReset.
 */
describe("createFeedback (integration reelle SQLite)", () => {
  let userId: string;
  const email = `test-feedback-${Date.now()}@example.com`;

  beforeAll(async () => {
    const user = await db.user.create({ data: { email, passwordHash: "x" } });
    userId = user.id;
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await db.feedback.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it("enregistre le retour avec l'identite de l'auteur et envoie la confirmation", async () => {
    const feedback = await createFeedback(userId, { content: "Un bug sur les tâches.", topic: "TACHES", anonymous: false });

    expect(feedback.userId).toBe(userId);
    expect(feedback.topic).toBe("TACHES");

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe(email);
  });

  it("n'enregistre pas l'identite de l'auteur quand anonymous=true, mais envoie quand meme la confirmation", async () => {
    const feedback = await createFeedback(userId, { content: "Retour anonyme.", topic: "AUTRE", anonymous: true });

    expect(feedback.userId).toBeNull();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe(email);
  });

  it("listFeedbackDetailed ne revele pas l'email d'un retour anonyme", async () => {
    await createFeedback(userId, { content: "Retour anonyme 2.", topic: "AUTRE", anonymous: true });
    await createFeedback(userId, { content: "Retour identifie.", topic: "AUTRE", anonymous: false });

    const rows = await listFeedbackDetailed();
    const anonymous = rows.find((r) => r.content === "Retour anonyme 2.");
    const identified = rows.find((r) => r.content === "Retour identifie.");

    expect(anonymous?.email).toBeNull();
    expect(identified?.email).toBe(email);
  });

  it("un compte supprime detache le retour (SetNull) sans le supprimer", async () => {
    const disposableUser = await db.user.create({ data: { email: `test-feedback-disposable-${Date.now()}@example.com`, passwordHash: "x" } });
    const feedback = await createFeedback(disposableUser.id, { content: "Retour avant suppression du compte.", topic: "AUTRE", anonymous: false });

    await db.user.delete({ where: { id: disposableUser.id } });

    const stored = await db.feedback.findUniqueOrThrow({ where: { id: feedback.id } });
    expect(stored.userId).toBeNull();
    expect(stored.content).toBe("Retour avant suppression du compte.");

    await db.feedback.delete({ where: { id: feedback.id } });
  });
});
