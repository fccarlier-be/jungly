import Link from "next/link";
import { requireSessionUserId } from "@/lib/session";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import LogoutButton from "@/components/LogoutButton";
import NotificationSettings from "@/components/NotificationSettings";
import ExportImport from "@/components/ExportImport";
import ThemeToggle from "@/components/ThemeToggle";
import AccountSettings from "@/components/AccountSettings";

export default async function SettingsPage() {
  const userId = await requireSessionUserId();
  const session = await auth();

  const preference = await db.notificationPreference.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">Paramètres</h1>

      <section className="card p-4 space-y-2 text-sm">
        <h2 className="font-semibold">Compte</h2>
        <AccountSettings email={session?.user?.email} initialName={session?.user?.name} />
      </section>

      <section className="card p-4 space-y-2 text-sm">
        <h2 className="font-semibold">Notifications</h2>
        <NotificationSettings
          initial={{
            enabled: preference.enabled,
            notificationTime: preference.notificationTime,
            overdueEnabled: preference.overdueEnabled,
            advanceReminderDays: preference.advanceReminderDays,
          }}
        />
      </section>

      <section className="card p-4 space-y-2 text-sm">
        <h2 className="font-semibold">Apparence</h2>
        <ThemeToggle />
      </section>

      <section className="card p-4 space-y-2 text-sm">
        <h2 className="font-semibold">Bibliothèque, engrais et historique</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/bibliotheque" className="chip flex-1 rounded-lg py-2 text-center min-w-[8rem]">
            Bibliothèque de plantes
          </Link>
          <Link href="/engrais" className="chip flex-1 rounded-lg py-2 text-center min-w-[8rem]">
            Mes engrais
          </Link>
          <Link href="/historique" className="chip flex-1 rounded-lg py-2 text-center min-w-[8rem]">
            Historique complet
          </Link>
        </div>
      </section>

      <section className="card p-4 space-y-2 text-sm">
        <h2 className="font-semibold">Unités</h2>
        <p className="text-muted">Volumes en ml/L, distances en mm/cm, converties automatiquement à l&apos;affichage.</p>
      </section>

      <section className="card p-4 space-y-2 text-sm">
        <h2 className="font-semibold">Export / Import</h2>
        <ExportImport />
      </section>

      <section className="card p-4 space-y-2 text-sm">
        <h2 className="font-semibold">À propos</h2>
        <p className="text-muted">Jungly - suivi et entretien de vos plantes.</p>
      </section>

      <LogoutButton />
    </div>
  );
}
