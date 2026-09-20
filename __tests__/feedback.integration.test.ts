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
    const user = await db.user.create({ data: { email, name: "Testeur Bêta", passwordHash: "x" } });
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
    const feedback = await createFeedback(userId, {
      summary: "Bug sur les tâches",
      content: "Un bug sur les tâches.",
      topic: "TACHES",
      anonymous: false,
    });

    expect(feedback.userId).toBe(userId);
    expect(feedback.summary).toBe("Bug sur les tâches");
    expect(feedback.topic).toBe("TACHES");

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe(email);
  });

  it("n'enregistre pas l'identite de l'auteur quand anonymous=true, mais envoie quand meme la confirmation", async () => {
    const feedback = await createFeedback(userId, {
      summary: "Retour anonyme",
      content: "Retour anonyme.",
      topic: "AUTRE",
      anonymous: true,
    });

    expect(feedback.userId).toBeNull();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe(email);
  });

  it("listFeedbackDetailed ne revele ni l'email ni le nom d'un retour anonyme, mais les deux sinon", async () => {
    await createFeedback(userId, { summary: "Anonyme 2", content: "Retour anonyme 2.", topic: "AUTRE", anonymous: true });
    await createFeedback(userId, { summary: "Identifié", content: "Retour identifie.", topic: "AUTRE", anonymous: false });

    const rows = await listFeedbackDetailed();
    const anonymous = rows.find((r) => r.content === "Retour anonyme 2.");
    const identified = rows.find((r) => r.content === "Retour identifie.");

    expect(anonymous?.email).toBeNull();
    expect(anonymous?.name).toBeNull();
    expect(identified?.email).toBe(email);
    expect(identified?.name).toBe("Testeur Bêta");
  });

  it("un compte supprime detache le retour (SetNull) sans le supprimer", async () => {
    const disposableUser = await db.user.create({ data: { email: `test-feedback-disposable-${Date.now()}@example.com`, passwordHash: "x" } });
    const feedback = await createFeedback(disposableUser.id, {
      summary: "Avant suppression",
      content: "Retour avant suppression du compte.",
      topic: "AUTRE",
      anonymous: false,
    });

    await db.user.delete({ where: { id: disposableUser.id } });

    const stored = await db.feedback.findUniqueOrThrow({ where: { id: feedback.id } });
    expect(stored.userId).toBeNull();
    expect(stored.content).toBe("Retour avant suppression du compte.");

    await db.feedback.delete({ where: { id: feedback.id } });
  });
});
