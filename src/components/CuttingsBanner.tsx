"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Leaf, MessageCircle, X } from "lucide-react";

interface Counts {
  newListings: number;
  unreadMessages: number;
}

/**
 * Banniere discrete au-dessus de la pile de taches du jour (retour
 * utilisateur, 2026-09-23) : nouvelles annonces d'autres comptes depuis le
 * dernier passage sur /boutures, ET messages non lus. "Ignorer" n'acquitte
 * que les nouvelles annonces (ne reviennent qu'avec la prochaine) -- un
 * message non lu reste un vrai "a faire" tant qu'il n'est pas ouvert, la
 * banniere revient donc au prochain chargement tant qu'il en reste.
 */
export default function CuttingsBanner() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    fetch("/api/cuttings/notifications")
      .then((res) => (res.ok ? res.json() : { newListings: 0, unreadMessages: 0 }))
      .then((data) => setCounts({ newListings: data.newListings ?? 0, unreadMessages: data.unreadMessages ?? 0 }))
      .catch(() => setCounts({ newListings: 0, unreadMessages: 0 }));
  }, []);

  if (!counts || hidden || (counts.newListings === 0 && counts.unreadMessages === 0)) return null;

  async function dismiss() {
    setHidden(true);
    try {
      await fetch("/api/cuttings/notifications", { method: "POST" });
    } catch {
      // Best-effort : la banniere reste masquee pour cette visite.
    }
  }

  const { newListings, unreadMessages } = counts;
  // Des messages non lus l'emportent : c'est ce qui attend une reponse.
  const href = unreadMessages > 0 ? "/boutures?tab=messages" : "/boutures";
  const Icon = unreadMessages > 0 ? MessageCircle : Leaf;

  return (
    <div className="card flex items-center gap-3 p-3.5" style={{ borderLeft: "3px solid var(--accent)" }}>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }}
      >
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        {unreadMessages > 0 && (
          <p>
            {unreadMessages} message{unreadMessages > 1 ? "s" : ""} non lu{unreadMessages > 1 ? "s" : ""} sur les boutures.
          </p>
        )}
        {newListings > 0 && (
          <p>
            {newListings} nouvelle{newListings > 1 ? "s" : ""} bouture{newListings > 1 ? "s" : ""} à donner ou échanger.
          </p>
        )}
      </div>
      <Link href={href} className="chip shrink-0 rounded-full px-3 py-1.5 text-sm">
        Voir
      </Link>
      <button type="button" onClick={dismiss} aria-label="Ignorer" className="btn-ghost shrink-0 rounded-full p-1.5">
        <X size={16} />
      </button>
    </div>
  );
}
