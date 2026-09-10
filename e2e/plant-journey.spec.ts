import { test, expect } from "@playwright/test";
import { cleanupDb, cleanupE2eData, E2E_MARKER } from "./dbCleanup";

// Utilise le compte seed (SEED_USER_EMAIL/PASSWORD) plutot qu'un compte
// jetable : ce parcours exerce des donnees reelles (plante + regle +
// tache), la plante est supprimee par le test lui-meme a la fin (voir
// cleanupE2eData() en filet de securite si une etape echoue avant ca).
const email = process.env.E2E_SEED_EMAIL;
const password = process.env.E2E_SEED_PASSWORD;
const plantName = `${E2E_MARKER} Plante ${Date.now()}`;

test.beforeAll(() => {
  if (!email || !password) {
    throw new Error("E2E_SEED_EMAIL et E2E_SEED_PASSWORD doivent être définis (identifiants du compte seed).");
  }
});

test.afterAll(async () => {
  await cleanupE2eData();
  await cleanupDb.$disconnect();
});

test("creer une plante, l'arroser, puis la supprimer", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill(email!);
  await page.locator("#password").fill(password!);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL("/");

  // 1. Creation d'une plante -- l'arrosage (FIXED_INTERVAL_DAYS/7j) est
  // active par defaut a la creation, generant automatiquement sa premiere tache.
  await page.goto("/plantes/nouvelle");
  await page.locator("#name").fill(plantName);
  await page.getByRole("button", { name: "Ajouter la plante" }).click();
  // (?!nouvelle) : /plantes/nouvelle elle-meme matcherait sinon aussi ce
  // pattern, faisant passer l'assertion instantanement avant meme que la
  // redirection post-soumission (asynchrone) n'ait eu lieu.
  await expect(page).toHaveURL(/\/plantes\/(?!nouvelle)[^/]+$/, { timeout: 10_000 });
  const plantId = page.url().match(/\/plantes\/([^/]+)$/)?.[1];
  expect(plantId).toBeTruthy();
  await expect(page.getByRole("heading", { name: plantName })).toBeVisible();

  // 2. La tache d'arrosage generee apparait sur /taches (section "A venir",
  // due dans 7 jours) et peut etre completee immediatement.
  await page.goto("/taches");
  const taskCard = page.locator(".card", { hasText: plantName });
  await expect(taskCard).toBeVisible();
  await taskCard.getByRole("button", { name: "Arrosée" }).click();
  // Ne PAS verifier que la plante disparait de /taches : completer une
  // tache d'une regle recurrente (FIXED_INTERVAL_DAYS) en regenere aussitot
  // une nouvelle (due dans 7 jours), qui reapparait avec le meme nom de
  // plante -- c'est le comportement normal du CareEngine, pas un bug.
  await page.waitForTimeout(500);

  // 3. L'evenement d'arrosage doit avoir ete enregistre dans l'historique de la fiche.
  await page.goto(`/plantes/${plantId}`);
  await expect(page.getByText("Historique récent")).toBeVisible();
  await expect(page.getByText("Aucun événement enregistré.")).toHaveCount(0);

  // 4. Nettoyage via l'UI (pas seulement le filet de securite Prisma).
  page.once("dialog", (dialog) => dialog.accept());
  await page.goto(`/plantes/${plantId}/modifier`);
  await page.getByRole("button", { name: "Supprimer cette plante" }).click();
  await expect(page).toHaveURL("/plantes");
  await expect(page.getByText(plantName)).toHaveCount(0);
});
