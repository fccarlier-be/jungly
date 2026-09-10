import { test, expect } from "@playwright/test";
import { createTestUser, loginAs, testPlantName } from "./testHelpers";
import { cleanupDb, cleanupE2eData } from "./dbCleanup";

// Deux comptes jetables (crees directement en base, voir testHelpers.ts) --
// le test le plus important pour l'architecture multi-utilisateur : verifie
// qu'aucune ressource d'un compte n'est accessible/modifiable depuis un
// autre, sur les endpoints touches par les corrections d'ownership de cette
// session (locationId, careRuleId, PlantPhoto).
let userA: Awaited<ReturnType<typeof createTestUser>>;
let userB: Awaited<ReturnType<typeof createTestUser>>;

test.beforeAll(async () => {
  userA = await createTestUser("owner-a");
  userB = await createTestUser("owner-b");
});

test.afterAll(async () => {
  await cleanupE2eData();
  await cleanupDb.$disconnect();
});

test("aucune ressource d'un compte n'est accessible depuis un autre compte", async ({ browser }) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await loginAs(pageA, userA.email, userA.password);

  // A cree : plante, regle d'entretien (-> tache), engrais, emplacement, photo.
  const plantRes = await pageA.request.post("/api/plants", { data: { name: testPlantName("Ownership A") } });
  expect(plantRes.ok()).toBe(true);
  const plantA = await plantRes.json();

  const locationRes = await pageA.request.post("/api/locations", { data: { name: `Salon A ${Date.now()}` } });
  expect(locationRes.ok()).toBe(true);
  const locationA = await locationRes.json();

  const fertilizerRes = await pageA.request.post("/api/fertilizers", { data: { name: `Engrais A ${Date.now()}` } });
  expect(fertilizerRes.ok()).toBe(true);
  const fertilizerA = await fertilizerRes.json();

  const ruleRes = await pageA.request.post("/api/care-rules", {
    data: { plantId: plantA.id, type: "WATERING", enabled: true, recurrenceType: "FIXED_INTERVAL_DAYS", interval: 7 },
  });
  expect(ruleRes.ok()).toBe(true);
  const ruleA = await ruleRes.json();

  const plantsListRes = await pageA.request.get("/api/plants");
  const plantsList = await plantsListRes.json();
  const taskA = plantsList.find((p: { id: string }) => p.id === plantA.id)?.nextTask;
  expect(taskA?.id).toBeTruthy();

  const uploadRes = await pageA.request.post("/api/uploads", {
    multipart: {
      file: {
        name: "test.png",
        mimeType: "image/png",
        buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
      },
    },
  });
  const { url: photoUrl } = await uploadRes.json();
  const addPhotoRes = await pageA.request.post(`/api/plants/${plantA.id}/photos`, { data: { urls: [photoUrl] } });
  const [photoA] = await addPhotoRes.json();
  expect(photoA?.id).toBeTruthy();

  // B se connecte separement (contexte navigateur independant) et tente
  // d'acceder/modifier chacune des ressources de A par id direct.
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await loginAs(pageB, userB.email, userB.password);

  const plantGetRes = await pageB.request.get(`/api/plants/${plantA.id}`);
  expect(plantGetRes.status()).toBe(404);

  const taskCompleteRes = await pageB.request.post(`/api/tasks/${taskA.id}/complete`, { data: {} });
  expect(taskCompleteRes.status()).toBe(404);

  const ruleDeleteRes = await pageB.request.delete(`/api/care-rules/${ruleA.id}`);
  expect(ruleDeleteRes.status()).toBe(404);

  const fertilizerDeleteRes = await pageB.request.delete(`/api/fertilizers/${fertilizerA.id}`);
  expect(fertilizerDeleteRes.status()).toBe(404);

  // B cree sa propre plante puis tente de la rattacher a l'emplacement de A.
  const plantBRes = await pageB.request.post("/api/plants", { data: { name: testPlantName("Ownership B") } });
  const plantB = await plantBRes.json();
  const patchLocationRes = await pageB.request.patch(`/api/plants/${plantB.id}`, { data: { locationId: locationA.id } });
  expect(patchLocationRes.status()).toBe(404);

  const photoDeleteRes = await pageB.request.delete(`/api/plants/${plantA.id}/photos/${photoA.id}`);
  expect(photoDeleteRes.status()).toBe(404);

  // B ne peut pas s'approprier le fichier physique de A en referencant
  // simplement son URL (UUID connu) -- assertOwnedUpload() doit rejeter,
  // que ce soit via la couverture, la galerie ou une note.
  const patchPhotoRes = await pageB.request.patch(`/api/plants/${plantB.id}`, { data: { photoUrl } });
  expect(patchPhotoRes.status()).toBe(400);

  const addPhotoBRes = await pageB.request.post(`/api/plants/${plantB.id}/photos`, { data: { urls: [photoUrl] } });
  expect(addPhotoBRes.status()).toBe(400);

  const noteRes = await pageB.request.post("/api/notes", {
    data: { plantId: plantB.id, content: "test", category: "OBSERVATION", photoUrl },
  });
  expect(noteRes.status()).toBe(400);

  // Nettoyage via l'UI/API (compte A).
  await pageA.request.delete(`/api/plants/${plantA.id}`);
  await pageB.request.delete(`/api/plants/${plantB.id}`);
  await pageA.request.delete(`/api/fertilizers/${fertilizerA.id}`);
});
