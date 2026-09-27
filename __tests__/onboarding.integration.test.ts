import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { needsOnboarding, completeOnboarding } from "@/server/onboarding";

/**
 * Integration reelle (vraie base SQLite), meme pattern que les autres
 * suites du projet.
 */
describe("onboarding (integration reelle SQLite)", () => {
  let userId: string;
  const email = `test-onboarding-${Date.now()}@example.com`;

  beforeEach(async () => {
    const user = await db.user.create({ data: { email, passwordHash: "x" } });
    userId = user.id;
  });

  afterEach(async () => {
    await db.user.delete({ where: { id: userId } });
  });

  it("un compte tout juste cree a besoin de la presentation", async () => {
    expect(await needsOnboarding(userId)).toBe(true);
  });

  it("completeOnboarding l'acquitte durablement", async () => {
    await completeOnboarding(userId);
    expect(await needsOnboarding(userId)).toBe(false);

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.onboardingCompletedAt).not.toBeNull();
  });

  it("est idempotent (rejouer la presentation puis la clore de nouveau ne casse rien)", async () => {
    await completeOnboarding(userId);
    const first = await db.user.findUniqueOrThrow({ where: { id: userId } });

    await completeOnboarding(userId);
    const second = await db.user.findUniqueOrThrow({ where: { id: userId } });

    expect(second.onboardingCompletedAt).not.toBeNull();
    expect(second.onboardingCompletedAt!.getTime()).toBeGreaterThanOrEqual(first.onboardingCompletedAt!.getTime());
  });
});
