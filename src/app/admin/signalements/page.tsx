import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminSessionUserId } from "@/lib/session";
import { isCuttingsMarketplaceEnabled } from "@/lib/features";
import { listReports } from "@/server/cuttings/reports";
import { listSuspendedMembers } from "@/server/cuttings/moderation";
import { CUTTING_REPORT_REASON_LABEL, CUTTING_CONSEQUENCE_LABEL, type CuttingReportReason } from "@/server/cuttings/types";
import ReportActions from "@/components/ReportActions";
import LiftSuspensionButton from "@/components/LiftSuspensionButton";

const DEFAULT_WARNING_MESSAGE: Record<string, string> = {
  VENTE:
    "Tu as proposé de vendre des boutures contre de l'argent. Le don/échange de boutures est strictement gratuit : toute vente est interdite.",
  COMPORTEMENT: "Ton comportement envers un autre membre n'est pas conforme aux règles de la communauté.",
  AUTRE: "",
};

export default async function AdminReportsPage() {
  if (!isCuttingsMarketplaceEnabled()) {
    notFound();
  }
  await requireAdminSessionUserId();
  const [reports, suspended] = await Promise.all([listReports(), listSuspendedMembers()]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Signalements de boutures</h1>
        <p className="text-muted mt-1 text-sm">
          Signalements de membres (typiquement : tentative de vente, interdite). Les derniers messages échangés sont joints au moment du
          signalement.
        </p>
      </div>

      {suspended.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Membres suspendus</h2>
          {suspended.map((m) => (
            <div key={m.id} className="card flex flex-wrap items-center justify-between gap-2 p-3.5 text-sm">
              <p>
                <strong>{m.pseudo ?? "sans pseudo"}</strong> ({m.email}) —{" "}
                {m.permanent ? "banni définitivement de l'application" : `suspendu du don/échange jusqu'au ${new Date(m.bannedUntil!).toLocaleDateString("fr-BE")}`}
                <span className="text-muted"> · {m.warningCount} avertissement{m.warningCount > 1 ? "s" : ""}</span>
              </p>
              <LiftSuspensionButton memberId={m.id} pseudo={m.pseudo ?? m.email} />
            </div>
          ))}
        </section>
      )}

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
            <p className="text-muted text-xs">
              {r.reportedWarnings} avertissement{r.reportedWarnings > 1 ? "s" : ""} déjà adressé{r.reportedWarnings > 1 ? "s" : ""} à ce membre.
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
            {r.status === "OUVERT" && (
              <ReportActions
                reportId={r.id}
                reportedPseudo={r.reported.pseudo ?? "ce membre"}
                defaultMessage={DEFAULT_WARNING_MESSAGE[r.reason] ?? ""}
                nextRank={r.reportedWarnings + 1}
                nextConsequenceLabel={CUTTING_CONSEQUENCE_LABEL[r.nextConsequence]}
                nextIsSanction={r.nextConsequence !== "NONE"}
              />
            )}
          </section>
        ))
      )}
    </div>
  );
}
