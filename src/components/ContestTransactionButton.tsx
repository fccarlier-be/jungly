"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Le destinataire conteste un echange enregistre a tort (mauvaise personne,
 * echange qui n'a pas eu lieu) : l'echange est annule, les boutures
 * retournent au stock et les notes eventuelles sont effacees. Confirmation
 * explicite -- l'action est definitive.
 */
export default function ContestTransactionButton({ transactionId, ownerPseudo }: { transactionId: string; ownerPseudo: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function contest() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/cuttings/transactions/${transactionId}/contest`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Action impossible.");
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
      <button type="button" onClick={() => setOpen(true)} className="text-muted text-xs underline underline-offset-2">
        Ce n&apos;est pas moi / je n&apos;ai rien reçu
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.45)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`contest-title-${transactionId}`}
        >
          <div className="card w-full max-w-sm space-y-4 p-5">
            <h2 id={`contest-title-${transactionId}`} className="font-display text-lg font-semibold leading-tight">
              Contester cet échange avec {ownerPseudo} ?
            </h2>
            <p className="text-muted text-sm">
              Fais-le si cet échange n&apos;a pas eu lieu, ou si {ownerPseudo} l&apos;a enregistré avec la mauvaise personne. Il sera
              annulé et les boutures seront rendues à l&apos;annonce. Tu ne pourras plus le contester une fois que tu l&apos;auras noté.
            </p>
            {error && (
              <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn-ghost flex-1 rounded-lg py-2.5 text-sm font-medium">
                Annuler
              </button>
              <button type="button" onClick={contest} disabled={pending} className="btn-primary flex-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60">
                {pending ? "..." : "Oui, contester"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
