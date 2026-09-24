import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { BETA_SIGNUP_LIMIT, confirmBetaSignupByToken, generateBetaToken } from "@/server/betaSignup";

/**
 * Test d'integration reelle (vraie base SQLite, vrai client Prisma) --
 * meme pattern que snoozeTaskById.integration.test.ts. Couvre en particulier
 * la limite des BETA_SIGNUP_LIMIT places : la 13e confirmation doit finir
 * WAITLISTED, pas CONFIRMED, meme si son inscription (PENDING) est plus
 * ancienne que d'autres deja confirmees.
 */
describe("confirmBetaSignupByToken (integration reelle SQLite)", () => {
  const createdEmails: string[] = [];

  async function createPending(email: string) {
    createdEmails.push(email);
    const token = generateBetaToken();
    await db.betaSignup.create({ data: { email, token } });
    return token;
  }

  beforeEach(async () => {
    await db.betaSignup.deleteMany({ where: { email: { in: createdEmails } } });
    createdEmails.length = 0;
  });

  afterAll(async () => {
    await db.betaSignup.deleteMany({ where: { email: { in: createdEmails } } });
    await db.$disconnect();
  });

  it("confirme une inscription PENDING quand une place est libre", async () => {
    const token = await createPending(`beta-ok-${Date.now()}@example.com`);

    const result = await confirmBetaSignupByToken(token);

    expect(result.outcome).toBe("confirmed");
    const stored = await db.betaSignup.findUniqueOrThrow({ where: { token } });
    expect(stored.status).toBe("CONFIRMED");
    expect(stored.confirmedAt).not.toBeNull();
  });

  it("met en liste d'attente une fois les BETA_SIGNUP_LIMIT places prises", async () => {
    // Remplit exactement la limite avec des inscriptions deja CONFIRMED.
    for (let i = 0; i < BETA_SIGNUP_LIMIT; i++) {
      const email = `beta-filled-${Date.now()}-${i}@example.com`;
      createdEmails.push(email);
      await db.betaSignup.create({
        data: { email, token: generateBetaToken(), status: "CONFIRMED", confirmedAt: new Date() },
      });
    }

    const token = await createPending(`beta-overflow-${Date.now()}@example.com`);
    const result = await confirmBetaSignupByToken(token);

    expect(result.outcome).toBe("waitlisted");
    const stored = await db.betaSignup.findUniqueOrThrow({ where: { token } });
    expect(stored.status).toBe("WAITLISTED");
    // ~12 ecritures SQLite sequentielles : depasse le delai par defaut (5 s)
    // quand la machine est chargee par le reste de la suite.
  }, 30_000);

  it("renvoie already-confirmed sans le reconfirmer", async () => {
    const email = `beta-already-${Date.now()}@example.com`;
    createdEmails.push(email);
    const token = generateBetaToken();
    const original = await db.betaSignup.create({
      data: { email, token, status: "CONFIRMED", confirmedAt: new Date("2026-01-01") },
    });

    const result = await confirmBetaSignupByToken(token);

    expect(result.outcome).toBe("already-confirmed");
    const stored = await db.betaSignup.findUniqueOrThrow({ where: { token } });
    expect(stored.confirmedAt?.getTime()).toBe(original.confirmedAt?.getTime());
  });

  it("renvoie invalid pour un jeton inconnu", async () => {
    const result = await confirmBetaSignupByToken("jeton-qui-n-existe-pas");
    expect(result.outcome).toBe("invalid");
  });
});
