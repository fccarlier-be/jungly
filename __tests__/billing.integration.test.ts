import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { ConflictError, BadRequestError } from "@/lib/errors";
import { HOSTED_ACCESS_PRODUCT_ID } from "@/server/billingProducts";

vi.mock("@/server/googlePlayBilling", () => ({
  verifyAndAcknowledgePurchase: vi.fn(),
}));

// Import après le mock (ordre requis par vi.mock, hoiste automatiquement).
import { verifyAndAcknowledgePurchase } from "@/server/googlePlayBilling";
import { provisionHostedAccount } from "@/server/billing";

/**
 * Test d'integration reelle (vraie base SQLite, vrai client Prisma) -- meme
 * pattern que betaSignup.integration.test.ts. L'appel reseau vers Google
 * Play (verifyAndAcknowledgePurchase) est le seul point mocke : impossible
 * a tester reellement sans un vrai compte Play Console, mais toute la
 * logique metier autour (anti-rejeu, unicite email, transaction) est
 * verifiee contre une vraie base.
 */
describe("provisionHostedAccount (integration reelle SQLite)", () => {
  const createdEmails: string[] = [];

  afterEach(async () => {
    vi.clearAllMocks();
    if (createdEmails.length) {
      await db.user.deleteMany({ where: { email: { in: createdEmails } } });
      await db.consumedPurchase.deleteMany({ where: { email: { in: createdEmails } } });
      createdEmails.length = 0;
    }
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("cree le compte et marque le jeton consomme quand l'achat est valide", async () => {
    vi.mocked(verifyAndAcknowledgePurchase).mockResolvedValue({ ok: true });
    const email = `billing-ok-${Date.now()}@example.com`;
    const purchaseToken = `tok-ok-${Date.now()}`;
    createdEmails.push(email);

    const account = await provisionHostedAccount({
      purchaseToken,
      productId: HOSTED_ACCESS_PRODUCT_ID,
      email,
      password: "password123",
    });

    expect(account.email).toBe(email);
    const user = await db.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    const consumed = await db.consumedPurchase.findUnique({ where: { purchaseToken } });
    expect(consumed?.email).toBe(email);
  });

  it("refuse un productId inconnu sans appeler Google", async () => {
    await expect(
      provisionHostedAccount({
        purchaseToken: `tok-${Date.now()}`,
        productId: "un_autre_produit",
        email: `billing-badproduct-${Date.now()}@example.com`,
        password: "password123",
      }),
    ).rejects.toThrow(BadRequestError);

    expect(verifyAndAcknowledgePurchase).not.toHaveBeenCalled();
  });

  it("refuse de rejouer un jeton deja consomme, sans appeler Google", async () => {
    const email = `billing-replay-${Date.now()}@example.com`;
    const purchaseToken = `tok-replay-${Date.now()}`;
    createdEmails.push(email);
    await db.consumedPurchase.create({ data: { purchaseToken, productId: HOSTED_ACCESS_PRODUCT_ID, email } });

    await expect(
      provisionHostedAccount({ purchaseToken, productId: HOSTED_ACCESS_PRODUCT_ID, email: `nouveau-${email}`, password: "password123" }),
    ).rejects.toThrow(ConflictError);

    expect(verifyAndAcknowledgePurchase).not.toHaveBeenCalled();
  });

  it("refuse un email deja utilise, sans appeler Google", async () => {
    const email = `billing-existing-${Date.now()}@example.com`;
    createdEmails.push(email);
    await db.user.create({ data: { email, passwordHash: "x" } });

    await expect(
      provisionHostedAccount({ purchaseToken: `tok-${Date.now()}`, productId: HOSTED_ACCESS_PRODUCT_ID, email, password: "password123" }),
    ).rejects.toThrow(ConflictError);

    expect(verifyAndAcknowledgePurchase).not.toHaveBeenCalled();
  });

  it("ne cree aucun compte si Google refuse l'achat", async () => {
    vi.mocked(verifyAndAcknowledgePurchase).mockResolvedValue({ ok: false, reason: "not_purchased" });
    const email = `billing-refused-${Date.now()}@example.com`;
    const purchaseToken = `tok-refused-${Date.now()}`;

    await expect(
      provisionHostedAccount({ purchaseToken, productId: HOSTED_ACCESS_PRODUCT_ID, email, password: "password123" }),
    ).rejects.toThrow(ConflictError);

    expect(await db.user.findUnique({ where: { email } })).toBeNull();
    expect(await db.consumedPurchase.findUnique({ where: { purchaseToken } })).toBeNull();
  });
});
