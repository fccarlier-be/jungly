import { db } from "@/server/db";

export interface AnnouncementData {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
}

/** Une seule "derniere annonce" a la fois (voir schema.prisma) -- toujours la plus recente, ou aucune si jamais publiee. */
export async function getLatestAnnouncement(): Promise<AnnouncementData | null> {
  return db.announcement.findFirst({ orderBy: { createdAt: "desc" } });
}

export async function createAnnouncement(input: { title: string; body: string }): Promise<AnnouncementData> {
  return db.announcement.create({ data: input });
}

/**
 * Acquitte l'annonce pour ce compte ("ne plus voir jusqu'a la prochaine
 * annonce") -- idempotent, aucune verification que announcementId est bien
 * LA derniere annonce : si une nouvelle a ete publiee entre l'affichage de
 * la modale et le clic, on acquitte quand meme celle que l'utilisateur a
 * reellement lue, la nouvelle s'affichera simplement au prochain chargement.
 */
export async function markAnnouncementSeen(userId: string, announcementId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { lastSeenAnnouncementId: announcementId } });
}
