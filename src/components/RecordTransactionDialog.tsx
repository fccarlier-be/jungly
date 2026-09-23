"use client";

import { useState } from "react";

/**
 * Confirmation EXPLICITE avant d'enregistrer un echange : le proprietaire
 * doit valider avec QUI et COMBIEN, pour ne pas cloturer avec la mauvaise
 * personne (une transaction ouvre la possibilite de se noter mutuellement --
 * une erreur ici produirait de mauvaises evaluations).
 */
export default function RecordTransactionDialog({
  recipientPseudo,
  max,
  pending,
  onConfirm,
  onCancel,
}: {
  recipientPseudo: string;
  max: number;
  pending: boolean;
  onConfirm: (quantity: number) => void;
  onCancel: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const safeQuantity = Math.min(Math.max(1, quantity), max);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-transaction-title"
    >
      <div className="card w-full max-w-sm space-y-4 p-5">
        <h2 id="record-transaction-title" className="font-display text-lg font-semibold leading-tight">
          La transaction avec {recipientPseudo} a-t-elle bien eu lieu ?
        </h2>

        <div className="space-y-1.5">
          <label htmlFor="transaction-quantity" className="text-muted block text-xs font-medium uppercase tracking-wide">
            Nombre de boutures remises (il en reste {max})
          </label>
          <input
            id="transaction-quantity"
            type="number"
            min={1}
            max={max}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value) || 1)}
            className="input w-24"
          />
        </div>

        <p className="text-muted text-sm">
          Vérifie bien la personne : c&apos;est avec <strong style={{ color: "var(--ink)" }}>{recipientPseudo}</strong> que
          vous pourrez ensuite vous noter mutuellement. Cette action est définitive.
        </p>

        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={pending} className="btn-ghost flex-1 rounded-lg py-2.5 text-sm font-medium">
            Non, annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirm(safeQuantity)}
            disabled={pending}
            className="btn-primary flex-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {pending ? "..." : `Oui, ${safeQuantity} bouture${safeQuantity > 1 ? "s" : ""} remise${safeQuantity > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
