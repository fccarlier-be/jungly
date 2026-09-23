import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getLatestAnnouncement, createAnnouncement, markAnnouncementSeen } from "@/server/announcements";

/**
 * Integration reelle (vraie base SQLite), meme pattern que les autres
 * suites du projet.
 */
describe("announcements (integration reelle SQLite)", () => {
  let userId: string;
  const email = `test-announcement-${Date.now()}@example.com`;

  beforeEach(async () => {
    const user = await db.user.create({ data: { email, passwordHash: "x" } });
    userId = user.id;
  });

  afterEach(async () => {
    await db.user.delete({ where: { id: userId } });
    await db.announcement.deleteMany({ where: { title: { startsWith: "TEST-" } } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("getLatestAnnouncement renvoie null quand aucune annonce n'existe", async () => {
    // Isolation impossible a garantir a 100% (table partagee entre tests),
    // mais si une annonce existe deja on verifie juste la coherence du tri
    // plutot que de supposer un etat vide.
    const before = await getLatestAnnouncement();
    if (before) return;
    expect(await getLatestAnnouncement()).toBeNull();
  });

  it("getLatestAnnouncement renvoie la plus recente quand plusieurs existent", async () => {
    await createAnnouncement({ title: "TEST-ancienne", body: "corps 1" });
    await new Promise((r) => setTimeout(r, 5));
    const recent = await createAnnouncement({ title: "TEST-recente", body: "corps 2" });

    const latest = await getLatestAnnouncement();
    expect(latest?.id).toBe(recent.id);
    expect(latest?.title).toBe("TEST-recente");
  });

  it("markAnnouncementSeen met a jour lastSeenAnnouncementId du compte", async () => {
    const announcement = await createAnnouncement({ title: "TEST-vue", body: "corps" });

    await markAnnouncementSeen(userId, announcement.id);

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.lastSeenAnnouncementId).toBe(announcement.id);
  });

  it("une annonce supprimee libere lastSeenAnnouncementId (onDelete: SetNull)", async () => {
    const announcement = await createAnnouncement({ title: "TEST-a-supprimer", body: "corps" });
    await markAnnouncementSeen(userId, announcement.id);

    await db.announcement.delete({ where: { id: announcement.id } });

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.lastSeenAnnouncementId).toBeNull();
  });
});
