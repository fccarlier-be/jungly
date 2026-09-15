import { requireAdminSessionUserId } from "@/lib/session";
import { getAnalyticsSummary } from "@/server/analytics";

const PATH_LABELS: Record<string, string> = {
  "/": "Accueil",
  "/installation.html": "Installation",
  "/mobile.html": "Sur mobile",
  "/sensors.html": "Capteurs IoT",
};

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4 text-center">
      <p className="text-2xl font-display font-semibold" style={{ color: "var(--primary-strong)" }}>
        {value}
      </p>
      <p className="text-muted text-xs mt-1">{label}</p>
    </div>
  );
}

export default async function AnalyticsPage() {
  await requireAdminSessionUserId();
  const summary = await getAnalyticsSummary();

  const homeViews = summary.pageViews.byPath.find((p) => p.path === "/")?.total ?? 0;
  const conversionRate = homeViews > 0 ? Math.round((summary.betaSignups.confirmed / homeViews) * 1000) / 10 : null;
  const maxDaily = Math.max(1, ...summary.pageViews.dailyLast14.map((d) => d.count));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Statistiques du site vitrine</h1>
        <p className="text-muted text-sm mt-1">
          Vues de page sur jungly.fcold.org — aucun visiteur individuel n&apos;est identifié ou suivi, seul un
          compte par page et par jour est conservé.
        </p>
      </div>

      <section className="grid grid-cols-3 gap-3">
        <StatTile label="Vues totales" value={summary.pageViews.total} />
        <StatTile label="7 derniers jours" value={summary.pageViews.last7Days} />
        <StatTile label="30 derniers jours" value={summary.pageViews.last30Days} />
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold text-sm">Tendance (14 derniers jours)</h2>
        {summary.pageViews.dailyLast14.length === 0 ? (
          <p className="text-muted text-sm">Aucune vue enregistrée sur cette période.</p>
        ) : (
          <div className="flex items-end gap-1.5 h-28">
            {summary.pageViews.dailyLast14.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d.day} : ${d.count}`}>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${Math.max(4, (d.count / maxDaily) * 100)}%`,
                    background: "var(--primary-soft)",
                  }}
                />
                <span className="text-[9px] text-muted">{d.day.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold text-sm">Par page</h2>
        {summary.pageViews.byPath.length === 0 ? (
          <p className="text-muted text-sm">Aucune vue enregistrée pour l&apos;instant.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs text-left">
                <th className="font-normal pb-2">Page</th>
                <th className="font-normal pb-2 text-right">Total</th>
                <th className="font-normal pb-2 text-right">7j</th>
                <th className="font-normal pb-2 text-right">30j</th>
              </tr>
            </thead>
            <tbody>
              {summary.pageViews.byPath.map((p) => (
                <tr key={p.path} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2">{PATH_LABELS[p.path] ?? p.path}</td>
                  <td className="py-2 text-right font-medium">{p.total}</td>
                  <td className="py-2 text-right">{p.last7Days}</td>
                  <td className="py-2 text-right">{p.last30Days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold text-sm">Inscriptions à la bêta</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Confirmées" value={summary.betaSignups.confirmed} />
          <StatTile label="En attente d'email" value={summary.betaSignups.pending} />
          <StatTile label="Liste d'attente" value={summary.betaSignups.waitlisted} />
        </div>
        <p className="text-muted text-sm">
          {homeViews === 0 ? (
            "Pas encore de vue enregistrée sur la page d'accueil pour calculer un taux."
          ) : (
            <>
              <strong style={{ color: "var(--ink)" }}>{conversionRate}%</strong> des vues de la page d&apos;accueil
              ({homeViews}) ont abouti à une inscription confirmée ({summary.betaSignups.confirmed}). Un chiffre bas
              malgré beaucoup de vues indique une page qui ne convainc pas ; peu de vues tout court indique surtout
              un problème de visibilité.
            </>
          )}
        </p>
      </section>
    </div>
  );
}
