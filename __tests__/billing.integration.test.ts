import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { ConflictError, BadRequestError } from "@/lib/errors";
import { HOSTED_ACCESS_PRODUCT_ID } from "@/server/billingProducts";

vi.mock("@/server/googlePlayBilling", () => ({
  verifyAndAcknowledgePurchase: vi.fn(),
  isPurchaseStillValid: vi.fn(),
}));

// Import après le mock (ordre requis par vi.mock, hoiste automatiquement).
import { verifyAndAcknowledgePurchase, isPurchaseStillValid } from "@/server/googlePlayBilling";
import { provisionHostedAccount, revokeExpiredPurchases } from "@/server/billing";

const PROVISIONING_ID = "provisioning-id-de-test";

/**
 * Test d'integration reelle (vraie base SQLite, vrai client Prisma) -- meme
 * pattern que betaSignup.integration.test.ts. Les appels reseau vers Google
 * Play (verifyAndAcknowledgePurchase, isPurchaseStillValid) sont les seuls
 * points mockes : impossible a tester reellement sans un vrai compte Play
 * Console, mais toute la logique metier autour (anti-rejeu, unicite email,
 * liaison achat/compte, transaction, revocation) est verifiee contre une
 * vraie base.
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

  it("cree le compte et marque le jeton consomme quand l'achat est valide et lie au bon provisioningId", async () => {
    vi.mocked(verifyAndAcknowledgePurchase).mockResolvedValue({ ok: true, obfuscatedExternalAccountId: PROVISIONING_ID });
    const email = `billing-ok-${Date.now()}@example.com`;
    const purchaseToken = `tok-ok-${Date.now()}`;
    createdEmails.push(email);

    const account = await provisionHostedAccount({
      purchaseToken,
      productId: HOSTED_ACCESS_PRODUCT_ID,
      provisioningId: PROVISIONING_ID,
      email,
      password: "password123",
    });

    expect(account.email).toBe(email);
    const user = await db.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user?.disabledAt).toBeNull();
    const consumed = await db.consumedPurchase.findUnique({ where: { purchaseToken } });
    expect(consumed?.email).toBe(email);
    expect(consumed?.revokedAt).toBeNull();
  });

  it("refuse quand le provisioningId ne correspond pas a celui renvoye par Google", async () => {
    vi.mocked(verifyAndAcknowledgePurchase).mockResolvedValue({ ok: true, obfuscatedExternalAccountId: "un-autre-id" });
    const email = `billing-mismatch-${Date.now()}@example.com`;
    const purchaseToken = `tok-mismatch-${Date.now()}`;

    await expect(
      provisionHostedAccount({ purchaseToken, productId: HOSTED_ACCESS_PRODUCT_ID, provisioningId: PROVISIONING_ID, email, password: "password123" }),
    ).rejects.toThrow(ConflictError);

    expect(await db.user.findUnique({ where: { email } })).toBeNull();
    expect(await db.consumedPurchase.findUnique({ where: { purchaseToken } })).toBeNull();
  });

  it("refuse un productId inconnu sans appeler Google", async () => {
    await expect(
      provisionHostedAccount({
        purchaseToken: `tok-${Date.now()}`,
        productId: "un_autre_produit",
        provisioningId: PROVISIONING_ID,
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
      provisionHostedAccount({
        purchaseToken,
        productId: HOSTED_ACCESS_PRODUCT_ID,
        provisioningId: PROVISIONING_ID,
        email: `nouveau-${email}`,
        password: "password123",
      }),
    ).rejects.toThrow(ConflictError);

    expect(verifyAndAcknowledgePurchase).not.toHaveBeenCalled();
  });

  it("refuse un email deja utilise, sans appeler Google", async () => {
    const email = `billing-existing-${Date.now()}@example.com`;
    createdEmails.push(email);
    await db.user.create({ data: { email, passwordHash: "x" } });

    await expect(
      provisionHostedAccount({ purchaseToken: `tok-${Date.now()}`, productId: HOSTED_ACCESS_PRODUCT_ID, provisioningId: PROVISIONING_ID, email, password: "password123" }),
    ).rejects.toThrow(ConflictError);

    expect(verifyAndAcknowledgePurchase).not.toHaveBeenCalled();
  });

  it("ne cree aucun compte si Google refuse l'achat", async () => {
    vi.mocked(verifyAndAcknowledgePurchase).mockResolvedValue({ ok: false, reason: "not_purchased" });
    const email = `billing-refused-${Date.now()}@example.com`;
    const purchaseToken = `tok-refused-${Date.now()}`;

    await expect(
      provisionHostedAccount({ purchaseToken, productId: HOSTED_ACCESS_PRODUCT_ID, provisioningId: PROVISIONING_ID, email, password: "password123" }),
    ).rejects.toThrow(ConflictError);

    expect(await db.user.findUnique({ where: { email } })).toBeNull();
    expect(await db.consumedPurchase.findUnique({ where: { purchaseToken } })).toBeNull();
  });
});

describe("revokeExpiredPurchases (integration reelle SQLite)", () => {
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

  it("desactive le compte dont l'achat n'est plus valide chez Google", async () => {
    const email = `revoke-${Date.now()}@example.com`;
    const purchaseToken = `tok-revoke-${Date.now()}`;
    createdEmails.push(email);
    await db.user.create({ data: { email, passwordHash: "x" } });
    await db.consumedPurchase.create({ data: { purchaseToken, productId: HOSTED_ACCESS_PRODUCT_ID, email } });
    vi.mocked(isPurchaseStillValid).mockResolvedValue(false);

    const result = await revokeExpiredPurchases();

    expect(result.revoked).toBe(1);
    const user = await db.user.findUnique({ where: { email } });
    expect(user?.disabledAt).not.toBeNull();
    const consumed = await db.consumedPurchase.findUnique({ where: { purchaseToken } });
    expect(consumed?.revokedAt).not.toBeNull();
  });

  it("ne touche pas un compte dont l'achat reste valide", async () => {
    const email = `revoke-valid-${Date.now()}@example.com`;
    const purchaseToken = `tok-revoke-valid-${Date.now()}`;
    createdEmails.push(email);
    await db.user.create({ data: { email, passwordHash: "x" } });
    await db.consumedPurchase.create({ data: { purchaseToken, productId: HOSTED_ACCESS_PRODUCT_ID, email } });
    vi.mocked(isPurchaseStillValid).mockResolvedValue(true);

    await revokeExpiredPurchases();

    const user = await db.user.findUnique({ where: { email } });
    expect(user?.disabledAt).toBeNull();
  });

  it("ne desactive rien sur une verification incertaine (cle absente/API injoignable)", async () => {
    const email = `revoke-unknown-${Date.now()}@example.com`;
    const purchaseToken = `tok-revoke-unknown-${Date.now()}`;
    createdEmails.push(email);
    await db.user.create({ data: { email, passwordHash: "x" } });
    await db.consumedPurchase.create({ data: { purchaseToken, productId: HOSTED_ACCESS_PRODUCT_ID, email } });
    vi.mocked(isPurchaseStillValid).mockResolvedValue(null);

    const result = await revokeExpiredPurchases();

    expect(result.revoked).toBe(0);
    const user = await db.user.findUnique({ where: { email } });
    expect(user?.disabledAt).toBeNull();
  });

  it("ignore un achat deja revoque (ne rappelle pas Google)", async () => {
    const email = `revoke-already-${Date.now()}@example.com`;
    const purchaseToken = `tok-revoke-already-${Date.now()}`;
    createdEmails.push(email);
    await db.consumedPurchase.create({ data: { purchaseToken, productId: HOSTED_ACCESS_PRODUCT_ID, email, revokedAt: new Date() } });

    const result = await revokeExpiredPurchases();

    expect(result.checked).toBe(0);
    expect(isPurchaseStillValid).not.toHaveBeenCalled();
  });
});
