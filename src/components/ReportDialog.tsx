"use client";

import { useState } from "react";
import { CUTTING_REPORT_REASONS, CUTTING_REPORT_REASON_LABEL, type CuttingReportReason } from "@/server/cuttings/types";

/** Signalement d'un membre a propos d'une annonce (typiquement : tentative de vente, interdite). */
export default function ReportDialog({
  listingId,
  reportedUserId,
  reportedPseudo,
  onClose,
}: {
  listingId: string;
  reportedUserId: string;
  reportedPseudo: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<CuttingReportReason>("VENTE");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cuttings/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportedUserId, listingId, reason, comment: comment || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Envoi impossible.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-title"
    >
      <div className="card w-full max-w-sm space-y-4 p-5">
        <h2 id="report-title" className="font-display text-lg font-semibold leading-tight">
          Signaler {reportedPseudo}
        </h2>

        {sent ? (
          <>
            <p className="text-sm">Merci, ton signalement a bien été transmis. Il sera examiné par l&apos;administrateur.</p>
            <button type="button" onClick={onClose} className="btn-primary w-full rounded-lg py-2.5 text-sm font-semibold">
              Fermer
            </button>
          </>
        ) : (
          <>
            <p className="text-muted text-xs">
              Les derniers messages échangés avec ce membre sur cette annonce seront joints au signalement, pour que
              l&apos;administrateur puisse vérifier les faits.
            </p>
            {error && (
              <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}
            <div className="space-y-1.5">
              {CUTTING_REPORT_REASONS.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="report-reason" checked={reason === r} onChange={() => setReason(r)} />
                  {CUTTING_REPORT_REASON_LABEL[r]}
                </label>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Précisions (optionnel)"
              aria-label="Précisions"
              className="input w-full"
            />
            <div className="flex gap-2">
              <button type="button" onClick={onClose} disabled={submitting} className="btn-ghost flex-1 rounded-lg py-2.5 text-sm font-medium">
                Annuler
              </button>
              <button type="button" onClick={submit} disabled={submitting} className="btn-primary flex-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60">
                {submitting ? "Envoi..." : "Signaler"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
