import JSZip from "jszip";
import { test, expect, type Page } from "@playwright/test";
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

// describe.serial + une seule connexion partagee entre les deux tests (au
// lieu d'un loginAs() par test) : le budget du rate limiter de connexion
// (10/5min/IP, partage par TOUTE la suite E2E) est deja tres serre une fois
// tous les fichiers additionnes -- voir la remarque similaire dans
// tasks-and-settings.spec.ts.
test.describe.serial("export/import backup", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAs(page, user.email, user.password);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("export puis import restaure la plante et le fichier physique de sa photo", async () => {
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

  test("import n'active jamais une URL /uploads/... dont le fichier est absent de l'archive", async () => {
    // Archive fabriquee a la main (pas via GET /api/export) : simule soit un
    // backup partiel/corrompu, soit une archive malveillante qui reference le
    // fichier d'un AUTRE utilisateur par son nom sans l'inclure dans le zip
    // -- si remapUrl() conservait l'URL telle quelle, la plante importee
    // pointerait vers ce fichier physique, que la route de service sert des
    // qu'une plante DU compte courant le reference (voir import/route.ts).
    const plantName = testPlantName("Orphan");
    const zip = new JSZip();
    zip.file(
      "data.json",
      JSON.stringify({
        version: 1,
        plants: [{ name: plantName, photoUrl: "/uploads/does-not-exist-in-this-archive.jpg" }],
      }),
    );
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    const importRes = await page.request.post("/api/import", {
      multipart: { file: { name: "orphan-url.zip", mimeType: "application/zip", buffer: zipBuffer } },
    });
    expect(importRes.ok()).toBe(true);

    const afterImport = await (await page.request.get("/api/plants")).json();
    const restored = afterImport.find((p: { name: string }) => p.name === plantName);
    expect(restored).toBeTruthy();
    expect(restored.photoUrl).toBeNull();

    await page.request.delete(`/api/plants/${restored.id}`);
  });

  test("rejette un ZIP bomb (entree tres compressee) sans creer de plante", async () => {
    // Une entree de zeros se compresse en DEFLATE a un ratio extreme -- 30
    // Mio de zeros tiennent en quelques Ko compresses, tout en depassant
    // largement MAX_UPLOAD_FILE_SIZE (8 Mio) une fois decompresses.
    // readZipEntryWithLimit() doit interrompre la decompression en flux des
    // que la limite est franchie, plutot que de bufferiser les 30 Mio en
    // entier avant de constater le depassement (audit security1.md, P1).
    const plantName = testPlantName("ZipBomb");
    const zip = new JSZip();
    zip.file("data.json", JSON.stringify({ version: 1, plants: [{ name: plantName }] }));
    zip.file("uploads/bomb.jpg", Buffer.alloc(30 * 1024 * 1024, 0), { compression: "DEFLATE", compressionOptions: { level: 9 } });
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
    // L'archive compressee doit rester tres en dessous de MAX_ZIP_FILE_SIZE
    // (10 Mio) -- sinon le test ne demontre rien de plus qu'un rejet sur la
    // taille brute de l'archive, deja teste ailleurs.
    expect(zipBuffer.length).toBeLessThan(1 * 1024 * 1024);

    const importRes = await page.request.post("/api/import", {
      multipart: { file: { name: "bomb.zip", mimeType: "application/zip", buffer: zipBuffer } },
    });
    expect(importRes.status()).toBe(400);

    const afterImport = await (await page.request.get("/api/plants")).json();
    expect(afterImport.some((p: { name: string }) => p.name === plantName)).toBe(false);
  });
});
