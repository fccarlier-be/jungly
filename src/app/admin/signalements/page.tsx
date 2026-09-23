import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminSessionUserId } from "@/lib/session";
import { isCuttingsMarketplaceEnabled } from "@/lib/features";
import { listReports } from "@/server/cuttings/reports";
import { CUTTING_REPORT_REASON_LABEL, type CuttingReportReason } from "@/server/cuttings/types";
import ReportHandleButton from "@/components/ReportHandleButton";

export default async function AdminReportsPage() {
  if (!isCuttingsMarketplaceEnabled()) {
    notFound();
  }
  await requireAdminSessionUserId();
  const reports = await listReports();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Signalements de boutures</h1>
        <p className="text-muted mt-1 text-sm">
          Signalements de membres (typiquement : tentative de vente, interdite). Les derniers messages échangés sont joints au moment du
          signalement.
        </p>
      </div>

      {reports.length === 0 ? (
        <p className="text-muted py-8 text-center">Aucun signalement.</p>
      ) : (
        reports.map((r) => (
          <section key={r.id} className="card space-y-2 p-4 text-sm" style={r.status === "OUVERT" ? { borderLeft: "3px solid var(--danger)" } : { opacity: 0.7 }}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-semibold">{CUTTING_REPORT_REASON_LABEL[r.reason as CuttingReportReason] ?? r.reason}</p>
              <span className="text-muted text-xs">
                {new Date(r.createdAt).toLocaleString("fr-BE")} · {r.status === "OUVERT" ? "À traiter" : "Traité"}
              </span>
            </div>
            <p>
              <strong>{r.reported.pseudo ?? "sans pseudo"}</strong> ({r.reported.email}) signalé par{" "}
              <strong>{r.reporter.pseudo ?? "sans pseudo"}</strong> ({r.reporter.email})
              {r.reportedTotal > 1 && <span style={{ color: "var(--danger)" }}> — {r.reportedTotal} signalements au total pour ce membre</span>}
            </p>
            {r.listing && (
              <p className="text-muted">
                Annonce :{" "}
                <Link href={`/boutures/${r.listing.id}`} className="underline underline-offset-2">
                  {r.listing.title}
                </Link>
              </p>
            )}
            {r.comment && <p>« {r.comment} »</p>}
            {r.evidence.length > 0 && (
              <details className="rounded-lg p-2" style={{ background: "var(--surface-alt)" }}>
                <summary className="cursor-pointer text-xs font-medium">Messages joints ({r.evidence.length})</summary>
                <div className="mt-2 space-y-1">
                  {r.evidence.map((m, i) => (
                    <p key={i} className="text-xs">
                      <strong>{m.from}</strong> <span className="text-muted">({new Date(m.at).toLocaleString("fr-BE")})</span> : {m.body}
                    </p>
                  ))}
                </div>
              </details>
            )}
            {r.status === "OUVERT" && <ReportHandleButton reportId={r.id} />}
          </section>
        ))
      )}
    </div>
  );
}
