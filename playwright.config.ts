import { defineConfig, devices } from "@playwright/test";

/**
 * Tests E2E des parcours reels, executes contre une instance DEJA
 * DEMARREE de l'app (jamais contre production directement) -- voir
 * e2e/README.md pour la commande complete (conteneur Playwright officiel,
 * reseau Docker partage avec plantes-app, base SQLite montee pour le
 * nettoyage direct des donnees de test).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  // 1 seul worker : SQLite ne serialise qu'un seul writer a la fois --
  // plusieurs tests ecrivant en parallele (creation de plantes/regles/
  // uploads) faisaient sinon la queue jusqu'a depasser le timeout de 30s
  // cote serveur ("Socket timeout") des que la suite a grandi.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
