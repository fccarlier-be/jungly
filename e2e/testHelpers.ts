import bcrypt from "bcryptjs";
import type { Page } from "@playwright/test";
import { cleanupDb, E2E_MARKER } from "./dbCleanup";

/**
 * Cree un compte de test directement en base (bcrypt, comme un vrai
 * utilisateur) sans passer par /api/register : evite de consommer le
 * rate limit d'inscription (5/15min/IP, partage entre tous les tests E2E
 * qui tournent depuis la meme IP) quand seul un compte pret a se
 * connecter est necessaire -- auth.spec.ts reste le seul test a exercer
 * /api/register lui-meme.
 */
export async function createTestUser(labelSuffix: string) {
  const email = `e2e-test-${labelSuffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "TestPassword123!";
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await cleanupDb.user.create({ data: { email, passwordHash, name: labelSuffix } });
  return { userId: user.id, email, password };
}

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("/");
}

export function testPlantName(suffix: string): string {
  return `${E2E_MARKER} ${suffix} ${Date.now()}`;
}
