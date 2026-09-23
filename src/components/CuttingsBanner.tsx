"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Leaf, X } from "lucide-react";

/**
 * Banniere discrete au-dessus de la pile de taches du jour (retour
 * utilisateur, 2026-09-23) -- visible uniquement s'il existe des annonces
 * OUVERTES publiees par d'autres comptes depuis le dernier passage sur
 * /boutures (voir countNewListingsSince). "Ignorer" l'acquitte
 * definitivement (ne revient qu'a la prochaine nouvelle annonce) ; "Voir"
 * l'acquitte aussi (server component /boutures appelle markCuttingsSeen de
 * son cote), en plus de naviguer.
 */
export default function CuttingsBanner() {
  const [count, setCount] = useState<number | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    fetch("/api/cuttings/notifications")
      .then((res) => (res.ok ? res.json() : { count: 0 }))
      .then((data) => setCount(data.count ?? 0))
      .catch(() => setCount(0));
  }, []);

  if (!count) return null;

  async function dismiss() {
    setDismissing(true);
    try {
      await fetch("/api/cuttings/notifications", { method: "POST" });
    } finally {
      setCount(0);
    }
  }

  return (
    <div className="card flex items-center gap-3 p-3.5" style={{ borderLeft: "3px solid var(--accent)" }}>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }}
      >
        <Leaf size={17} />
      </span>
      <p className="min-w-0 flex-1 text-sm">
        {count} nouvelle{count > 1 ? "s" : ""} bouture{count > 1 ? "s" : ""} à donner ou échanger.
      </p>
      <Link href="/boutures" className="chip shrink-0 rounded-full px-3 py-1.5 text-sm">
        Voir
      </Link>
      <button
        type="button"
        onClick={dismiss}
        disabled={dismissing}
        aria-label="Ignorer cette annonce"
        className="btn-ghost shrink-0 rounded-full p-1.5"
      >
        <X size={16} />
      </button>
    </div>
  );
}
