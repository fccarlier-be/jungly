import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { cleanupDb, cleanupE2eData, E2E_MARKER } from "./dbCleanup";

// Compte seed reutilise (comme plant-journey.spec.ts) : une seule plante
// creee et supprimee par le test lui-meme, pas de risque d'ecraser les
// donnees reelles. E2E_UPLOADS_DIR : dossier reellement utilise par le
// serveur teste, pour verifier la presence/absence reelle des fichiers sur
// disque (pas seulement les URLs en base) -- /data/uploads par defaut (voir
// e2e/README.md, volume monte identique au conteneur), remplace par la CI
// (serveur ephemere sans Docker, uploads sous <repo>/public/uploads).
const UPLOADS_DIR = process.env.E2E_UPLOADS_DIR ?? "/data/uploads";
const email = process.env.E2E_SEED_EMAIL;
const password = process.env.E2E_SEED_PASSWORD;
const plantName = `${E2E_MARKER} Photos ${Date.now()}`;
const TEST_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test.beforeAll(() => {
  if (!email || !password) {
    throw new Error("E2E_SEED_EMAIL et E2E_SEED_PASSWORD doivent être définis (identifiants du compte seed).");
  }
});

test.afterAll(async () => {
  await cleanupE2eData();
  await cleanupDb.$disconnect();
});

test("upload, galerie, couverture, suppression avec promotion, suppression de la plante", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill(email!);
  await page.locator("#password").fill(password!);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("/");

  const plantRes = await page.request.post("/api/plants", { data: { name: plantName } });
  const plant = await plantRes.json();

  async function uploadPhoto(): Promise<string> {
    const res = await page.request.post("/api/uploads", {
      multipart: { file: { name: "test.png", mimeType: "image/png", buffer: TEST_PNG } },
    });
    const { url } = await res.json();
    return url;
  }

  // Deux photos, pour verifier la promotion automatique de couverture.
  const urlOne = await uploadPhoto();
  const urlTwo = await uploadPhoto();
  const addPhotosRes = await page.request.post(`/api/plants/${plant.id}/photos`, { data: { urls: [urlOne, urlTwo] } });
  const [photoOne] = await addPhotosRes.json();
  await page.request.patch(`/api/plants/${plant.id}`, { data: { photoUrl: urlOne } });

  const filePathOne = `${UPLOADS_DIR}/${path.basename(urlOne)}`;
  const filePathTwo = `${UPLOADS_DIR}/${path.basename(urlTwo)}`;
  expect(existsSync(filePathOne)).toBe(true);
  expect(existsSync(filePathTwo)).toBe(true);

  // Supprime la couverture -> l'autre photo doit etre promue automatiquement
  // (voir src/app/api/plants/[id]/photos/[photoId]/route.ts) et son fichier disparaitre du disque.
  const deletePhotoRes = await page.request.delete(`/api/plants/${plant.id}/photos/${photoOne.id}`);
  expect(deletePhotoRes.ok()).toBe(true);
  expect(existsSync(filePathOne)).toBe(false);

  const plantsAfterDelete = await (await page.request.get("/api/plants")).json();
  const afterDelete = plantsAfterDelete.find((p: { id: string }) => p.id === plant.id);
  expect(afterDelete.photoUrl).toBe(urlTwo);

  // Suppression de la plante -> le fichier physique de la 2e photo doit aussi disparaitre.
  await page.request.delete(`/api/plants/${plant.id}`);
  expect(existsSync(filePathTwo)).toBe(false);
});

test("GET /uploads/... refuse la mise en cache d'un 404 (security2.md)", async ({ page }) => {
  // Sans Cache-Control explicite sur ce 404, Cloudflare y injectait son
  // propre defaut (max-age=14400, verifie en direct sur plantes.fcold.org)
  // et le mettait en cache d'edge -- alors qu'une URL /uploads/... fraichement
  // televersee mais pas encore attachee a une plante (cas normal : apercu
  // avant sauvegarde du formulaire, voir PlantForm.tsx) redeviendrait
  // legitimement accessible une fois la plante sauvegardee. private/no-store
  // empeche tout cache (CDN ou navigateur) de servir cet etat perime.
  await page.goto("/login");
  await page.locator("#email").fill(email!);
  await page.locator("#password").fill(password!);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("/");

  const uploadRes = await page.request.post("/api/uploads", {
    multipart: { file: { name: "test.png", mimeType: "image/png", buffer: TEST_PNG } },
  });
  const { url } = await uploadRes.json();

  // Jamais attachee a aucune plante : le fichier existe sur disque mais
  // n'appartient encore a aucune ressource, exactement le 404 qui se
  // faisait mettre en cache.
  const getRes = await page.request.get(url);
  expect(getRes.status()).toBe(404);
  expect(getRes.headers()["cache-control"]).toBe("private, no-store");

  // Nettoyage manuel : ce fichier n'est jamais attache a une plante, donc
  // aucune des routes de suppression habituelles (photos/plantes) ne le
  // supprimerait pour nous.
  const filename = path.basename(url);
  const filePath = `${UPLOADS_DIR}/${filename}`;
  expect(existsSync(filePath)).toBe(true);
  await unlink(filePath);
  await cleanupDb.upload.deleteMany({ where: { filename } });
});
