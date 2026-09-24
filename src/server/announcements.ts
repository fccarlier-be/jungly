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

/** Nombre d'annonces recentes considerees : la derniere + les precedentes que le membre a pu rater. */
export const ANNOUNCEMENT_WINDOW = 3;

/**
 * Annonces a montrer a ce compte : parmi les ANNOUNCEMENT_WINDOW plus
 * recentes, celles publiees APRES la derniere qu'il a acquittee, de la plus
 * recente a la plus ancienne. Une nouvelle annonce apparait ainsi suivie des
 * deux precedentes que le membre n'avait pas vues, sans jamais reafficher ce
 * qu'il a deja lu. Vide = rien a montrer.
 */
export async function getUnseenAnnouncements(userId: string): Promise<AnnouncementData[]> {
  const [recent, user] = await Promise.all([
    db.announcement.findMany({ orderBy: { createdAt: "desc" }, take: ANNOUNCEMENT_WINDOW }),
    db.user.findUnique({ where: { id: userId }, select: { lastSeenAnnouncementId: true } }),
  ]);
  if (recent.length === 0 || !user?.lastSeenAnnouncementId) return recent;
  const lastSeen = await db.announcement.findUnique({
    where: { id: user.lastSeenAnnouncementId },
    select: { createdAt: true },
  });
  if (!lastSeen) return recent;
  return recent.filter((a) => a.createdAt.getTime() > lastSeen.createdAt.getTime());
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
