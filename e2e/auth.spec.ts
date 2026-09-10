import { test, expect } from "@playwright/test";
import { cleanupDb, cleanupE2eData } from "./dbCleanup";

// Prefixe "e2e-test-" : reconnu par cleanupE2eData() pour la suppression
// finale du compte, et par le rate limiting (10 tentatives/5min/IP sur le
// login, 5/15min sur l'inscription) -- eviter de relancer ce test en boucle
// rapprochee pendant le developpement, sous peine de 429.
const email = `e2e-test-${Date.now()}@example.com`;
const password = "TestPassword123!";

test.afterAll(async () => {
  await cleanupE2eData();
  await cleanupDb.$disconnect();
});

test("inscription puis deconnexion/reconnexion", async ({ page }) => {
  await page.goto("/inscription");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#confirmPassword").fill(password);
  await page.getByRole("button", { name: "Créer mon compte" }).click();

  // L'inscription connecte automatiquement -> redirection vers l'accueil.
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Mes plantes" }).first()).toBeVisible();

  await page.goto("/parametres");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/login/);

  // Reconnexion avec les identifiants tout juste crees.
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL("/");
});

test("mauvais mot de passe refuse", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("ceci-est-faux");
  await page.getByRole("button", { name: "Se connecter" }).click();
  // p[role="alert"] specifiquement : Next.js a son propre role="alert" pour
  // l'annonceur de route (accessibilite), qui matchait aussi getByRole("alert").
  await expect(page.locator('p[role="alert"]')).toHaveText(/incorrect/i);
  expect(page.url()).toContain("/login");
});
