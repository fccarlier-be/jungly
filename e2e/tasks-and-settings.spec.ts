import { test, expect } from "@playwright/test";
import { createTestUser, loginAs, testPlantName } from "./testHelpers";
import { cleanupDb, cleanupE2eData } from "./dbCleanup";

let user: Awaited<ReturnType<typeof createTestUser>>;

test.beforeAll(async () => {
  user = await createTestUser("tasks-settings");
});

test.afterAll(async () => {
  await cleanupE2eData();
  await cleanupDb.$disconnect();
});

test("une tache reportee redevient due une fois le report expire", async ({ page }) => {
  await loginAs(page, user.email, user.password);

  const plantRes = await page.request.post("/api/plants", { data: { name: testPlantName("Snooze") } });
  const plant = await plantRes.json();
  await page.request.post("/api/care-rules", {
    data: { plantId: plant.id, type: "WATERING", enabled: true, recurrenceType: "FIXED_INTERVAL_DAYS", interval: 7 },
  });

  const plantsBefore = await (await page.request.get("/api/plants")).json();
  const taskId = plantsBefore.find((p: { id: string }) => p.id === plant.id)?.nextTask?.id;
  expect(taskId).toBeTruthy();

  // Report a demain (voir #10 dans le suivi -- doit rester non "en retard").
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const snoozeRes = await page.request.post(`/api/tasks/${taskId}/snooze`, { data: { until: tomorrow.toISOString() } });
  expect(snoozeRes.ok()).toBe(true);

  let plants = await (await page.request.get("/api/plants")).json();
  let current = plants.find((p: { id: string }) => p.id === plant.id);
  expect(current.nextTask.status).toBe("SNOOZED");
  expect(current.overdue).toBe(false);

  // Simule l'expiration du report (pas d'attente reelle d'une journee) en
  // manipulant directement snoozedUntil -- la tache doit alors redevenir
  // "due" via effectiveDueDate()/isTaskDueNow(), sans que son status change.
  await cleanupDb.task.update({ where: { id: taskId }, data: { snoozedUntil: new Date(Date.now() - 60_000) } });

  plants = await (await page.request.get("/api/plants")).json();
  current = plants.find((p: { id: string }) => p.id === plant.id);
  expect(current.nextTask.status).toBe("SNOOZED");
  expect(current.overdue).toBe(true);

  await page.request.delete(`/api/plants/${plant.id}`);
});

test("le reglage 'tâches en retard' persiste apres rechargement", async ({ page }) => {
  await loginAs(page, user.email, user.password);
  await page.goto("/parametres");

  // "Signaler les tâches en retard" n'apparait que si le digest quotidien
  // est active (enabled=false par defaut pour un compte fraichement cree).
  const digestToggle = page.getByLabel("Digest quotidien activé");
  if (!(await digestToggle.isChecked())) {
    await digestToggle.click();
  }

  const overdueToggle = page.getByLabel("Signaler les tâches en retard");
  await expect(overdueToggle).toBeVisible();
  const wasChecked = await overdueToggle.isChecked();
  await overdueToggle.click();

  await expect(async () => {
    const pref = await cleanupDb.notificationPreference.findUnique({ where: { userId: user.userId } });
    expect(pref?.overdueEnabled).toBe(!wasChecked);
  }).toPass({ timeout: 5_000 });

  await page.reload();
  await expect(page.getByLabel("Signaler les tâches en retard")).toHaveJSProperty("checked", !wasChecked);
});
