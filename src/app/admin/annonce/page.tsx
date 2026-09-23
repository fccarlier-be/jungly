import { requireAdminSessionUserId } from "@/lib/session";
import { getLatestAnnouncement } from "@/server/announcements";
import AnnouncementAdminForm from "@/components/AnnouncementAdminForm";

export default async function AdminAnnouncementPage() {
  await requireAdminSessionUserId();
  const latest = await getLatestAnnouncement();

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">Annonce de nouveautés</h1>

      {latest && (
        <section className="card space-y-2 p-4 text-sm">
          <h2 className="font-semibold">Annonce actuelle</h2>
          <p className="font-medium">{latest.title}</p>
          <p className="text-muted whitespace-pre-line">{latest.body}</p>
          <p className="text-muted text-xs">Publiée le {latest.createdAt.toLocaleString("fr-BE")}</p>
        </section>
      )}

      <section className="card space-y-3 p-4 text-sm">
        <h2 className="font-semibold">Publier une nouvelle annonce</h2>
        <p className="text-muted">
          Remplace l&apos;annonce actuelle pour tous les comptes — chacun la reverra à son prochain chargement de
          l&apos;app, qu&apos;il ait déjà vu ou non la précédente.
        </p>
        <AnnouncementAdminForm />
      </section>
    </div>
  );
}
