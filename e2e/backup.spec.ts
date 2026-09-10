import { test, expect } from "@playwright/test";
import { createTestUser, loginAs, testPlantName } from "./testHelpers";
import { cleanupDb, cleanupE2eData } from "./dbCleanup";

// Compte jetable OBLIGATOIRE ici (jamais le compte seed) : l'export
// contient TOUTE la collection du compte, et l'import cree toujours de
// nouveaux enregistrements (jamais de fusion) -- exporter/reimporter avec
// un compte ayant deja des plantes reelles les duplique integralement.
let user: Awaited<ReturnType<typeof createTestUser>>;

test.beforeAll(async () => {
  user = await createTestUser("backup");
});

test.afterAll(async () => {
  await cleanupE2eData();
  await cleanupDb.$disconnect();
});

test("export puis import restaure la plante et le fichier physique de sa photo", async ({ page }) => {
  await loginAs(page, user.email, user.password);

  const plantName = testPlantName("Backup");
  const plantRes = await page.request.post("/api/plants", { data: { name: plantName } });
  const plant = await plantRes.json();

  const uploadRes = await page.request.post("/api/uploads", {
    multipart: {
      file: {
        name: "test.png",
        mimeType: "image/png",
        buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
      },
    },
  });
  const { url: photoUrl } = await uploadRes.json();
  await page.request.post(`/api/plants/${plant.id}/photos`, { data: { urls: [photoUrl] } });
  await page.request.patch(`/api/plants/${plant.id}`, { data: { photoUrl } });

  const exportRes = await page.request.get("/api/export");
  expect(exportRes.ok()).toBe(true);
  expect(exportRes.headers()["content-type"]).toContain("application/zip");
  const zipBuffer = await exportRes.body();

  await page.request.delete(`/api/plants/${plant.id}`);
  const afterDelete = await (await page.request.get("/api/plants")).json();
  expect(afterDelete.some((p: { id: string }) => p.id === plant.id)).toBe(false);

  const importRes = await page.request.post("/api/import", {
    multipart: { file: { name: "backup.zip", mimeType: "application/zip", buffer: zipBuffer } },
  });
  expect(importRes.ok()).toBe(true);
  const importBody = await importRes.json();
  expect(importBody.importedPlants).toBe(1);

  const afterImport = await (await page.request.get("/api/plants")).json();
  const restored = afterImport.find((p: { name: string }) => p.name === plantName);
  expect(restored).toBeTruthy();
  expect(restored.photoUrl).toBeTruthy();
  // Nom de fichier neuf (UUID frais) : ne reutilise jamais le nom d'origine.
  expect(restored.photoUrl).not.toBe(photoUrl);

  const photoFetch = await page.request.get(restored.photoUrl);
  expect(photoFetch.ok()).toBe(true);

  await page.request.delete(`/api/plants/${restored.id}`);
});
