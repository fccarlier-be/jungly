import { test, expect } from "@playwright/test";
import { cleanupDb, cleanupE2eData, E2E_MARKER } from "./dbCleanup";
import { createTestUser } from "./testHelpers";

// Prefixe "e2e-test-" : reconnu par cleanupE2eData() pour la suppression
// finale du compte, et par le rate limiting (10 tentatives/5min/IP sur le
// login, 5/15min sur l'inscription) -- eviter de relancer ce test en boucle
// rapprochee pendant le developpement, sous peine de 429.
const email = `e2e-test-${Date.now()}@example.com`;
const password = "TestPassword123!";

// Compte separe : le premier test ci-dessous SUPPRIME le compte "email" ;
// createTestUser() (insertion DB directe) ne consomme pas le budget du
// rate limiter d'inscription, contrairement a un passage par /inscription.
let wrongPasswordUser: { email: string; password: string };

test.beforeAll(async () => {
  wrongPasswordUser = await createTestUser("wrong-password");
});

test.afterAll(async () => {
  await cleanupE2eData();
  await cleanupDb.$disconnect();
});

test("inscription, deconnexion/reconnexion, puis suppression du compte", async ({ page }) => {
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

  // Suite directement enchainee sur cette meme session (pas de nouveau
  // test() separe) : un loginAs() supplementaire pousserait le budget de
  // connexions de la suite entiere au-dessus de la limite du rate limiter
  // (voir e2e/README.md, "Budget de connexions de la suite entiere").
  //
  // Une plante est creee pour verifier que la suppression de compte
  // supprime bien aussi ses donnees liees (cascade), pas seulement le
  // compte lui-meme.
  const plantRes = await page.request.post("/api/plants", { data: { name: `${E2E_MARKER} Suppression ${Date.now()}` } });
  const plant = await plantRes.json();

  await page.goto("/parametres");
  await page.getByRole("button", { name: "Supprimer mon compte" }).click();
  await page.locator("#confirm-email").fill(email);
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();

  // La suppression deconnecte automatiquement (signOut cote client).
  await expect(page).toHaveURL(/\/login/);

  const deletedUser = await cleanupDb.user.findUnique({ where: { email } });
  expect(deletedUser).toBeNull();
  const deletedPlant = await cleanupDb.plant.findUnique({ where: { id: plant.id } });
  expect(deletedPlant).toBeNull();
});

test("mauvais mot de passe refuse", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill(wrongPasswordUser.email);
  await page.locator("#password").fill("ceci-est-faux");
  await page.getByRole("button", { name: "Se connecter" }).click();
  // p[role="alert"] specifiquement : Next.js a son propre role="alert" pour
  // l'annonceur de route (accessibilite), qui matchait aussi getByRole("alert").
  await expect(page.locator('p[role="alert"]')).toHaveText(/incorrect/i);
  expect(page.url()).toContain("/login");
});
