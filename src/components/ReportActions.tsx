"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Actions de l'administrateur sur un signalement OUVERT : avertir le membre
 * (declenche les paliers de suspension, voir consequenceForRank) ou classer
 * sans suite. L'avertissement est confirme avec sa consequence AVANT envoi.
 */
export default function ReportActions({
  reportId,
  reportedPseudo,
  defaultMessage,
  nextRank,
  nextConsequenceLabel,
  nextIsSanction,
}: {
  reportId: string;
  reportedPseudo: string;
  defaultMessage: string;
  nextRank: number;
  nextConsequenceLabel: string;
  nextIsSanction: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(defaultMessage);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function dismiss() {
    setPending(true);
    try {
      await fetch(`/api/cuttings/reports/${reportId}/handle`, { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function warn() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/cuttings/reports/${reportId}/warn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.details?.fieldErrors?.message?.[0] ?? body.error ?? "Envoi impossible.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen(true)} disabled={pending} className="btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60">
          Avertir {reportedPseudo}
        </button>
        <button type="button" onClick={dismiss} disabled={pending} className="btn-ghost rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60">
          Classer sans suite
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.45)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`warn-title-${reportId}`}
        >
          <div className="card w-full max-w-md space-y-3 p-5">
            <h2 id={`warn-title-${reportId}`} className="font-display text-lg font-semibold leading-tight">
              Avertir {reportedPseudo}
            </h2>
            <p className="rounded-lg p-2.5 text-sm font-medium" style={{ background: nextIsSanction ? "color-mix(in srgb, var(--danger) 14%, transparent)" : "var(--surface-alt)" }}>
              Avertissement n°{nextRank} — {nextConsequenceLabel}
            </p>
            <label htmlFor={`warn-message-${reportId}`} className="text-muted block text-xs font-medium uppercase tracking-wide">
              Message envoyé au membre (aussi par e-mail)
            </label>
            <textarea
              id={`warn-message-${reportId}`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
              rows={5}
              className="input w-full"
            />
            {error && (
              <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn-ghost flex-1 rounded-lg py-2.5 text-sm font-medium">
                Annuler
              </button>
              <button type="button" onClick={warn} disabled={pending || !message.trim()} className="btn-primary flex-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60">
                {pending ? "..." : "Envoyer l'avertissement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
