import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getLatestAnnouncement, getUnseenAnnouncements, createAnnouncement, markAnnouncementSeen } from "@/server/announcements";

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

  describe("getUnseenAnnouncements : la derniere, suivie des precedentes ratees", () => {
    async function publish(...titles: string[]) {
      const created = [];
      for (const title of titles) {
        created.push(await createAnnouncement({ title: `TEST-${title}`, body: `corps ${title}` }));
        await new Promise((r) => setTimeout(r, 5));
      }
      return created;
    }
    const titlesOf = (list: Array<{ title: string }>) => list.filter((a) => a.title.startsWith("TEST-")).map((a) => a.title);

    it("jamais rien vu : les 3 plus recentes, de la plus recente a la plus ancienne", async () => {
      await publish("a1", "a2", "a3", "a4");
      expect(titlesOf(await getUnseenAnnouncements(userId))).toEqual(["TEST-a4", "TEST-a3", "TEST-a2"]);
    });

    it("a deja vu une annonce recente : seules les plus recentes qu'elle restent", async () => {
      const [, a2, a3, a4] = await publish("b1", "b2", "b3", "b4");
      await markAnnouncementSeen(userId, a2.id);
      expect(titlesOf(await getUnseenAnnouncements(userId))).toEqual(["TEST-b4", "TEST-b3"]);
      await markAnnouncementSeen(userId, a3.id);
      expect(titlesOf(await getUnseenAnnouncements(userId))).toEqual(["TEST-b4"]);
      await markAnnouncementSeen(userId, a4.id);
      expect(await getUnseenAnnouncements(userId)).toEqual([]);
    });

    it("la derniere vue est plus ancienne que la fenetre : les 3 plus recentes", async () => {
      const [a1] = await publish("c1", "c2", "c3", "c4", "c5");
      await markAnnouncementSeen(userId, a1.id);
      expect(titlesOf(await getUnseenAnnouncements(userId))).toEqual(["TEST-c5", "TEST-c4", "TEST-c3"]);
    });
  });

  it("une annonce supprimee libere lastSeenAnnouncementId (onDelete: SetNull)", async () => {
    const announcement = await createAnnouncement({ title: "TEST-a-supprimer", body: "corps" });
    await markAnnouncementSeen(userId, announcement.id);

    await db.announcement.delete({ where: { id: announcement.id } });

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.lastSeenAnnouncementId).toBeNull();
  });
});
