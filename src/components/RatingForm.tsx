"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { CUTTING_RATING_MIN, CUTTING_RATING_MAX } from "@/server/cuttings/types";

/** Note (etoiles + commentaire) laissee a l'autre participant d'UNE transaction -- une seule fois. */
export default function RatingForm({ transactionId, counterpartPseudo }: { transactionId: string; counterpartPseudo: string }) {
  const router = useRouter();
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cuttings/transactions/${transactionId}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score, comment: comment || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Envoi impossible.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-muted text-sm">Comment s&apos;est passé cet échange avec {counterpartPseudo} ?</p>
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <div className="flex gap-1">
        {Array.from({ length: CUTTING_RATING_MAX - CUTTING_RATING_MIN + 1 }, (_, i) => i + CUTTING_RATING_MIN).map((n) => (
          <button key={n} type="button" onClick={() => setScore(n)} aria-label={`${n} étoile${n > 1 ? "s" : ""}`}>
            <Star size={22} fill={n <= score ? "var(--warning)" : "none"} stroke="var(--warning)" />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="État de la bouture, conformité avec les photos, conseils reçus..."
        className="input w-full"
      />
      <button type="button" onClick={submit} disabled={submitting} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60">
        {submitting ? "Envoi..." : "Envoyer ma note"}
      </button>
    </div>
  );
}
