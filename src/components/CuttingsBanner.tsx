"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Leaf, MessageCircle, TriangleAlert, X } from "lucide-react";

interface Counts {
  newListings: number;
  unreadMessages: number;
  ratingsToGive: number;
  warnings: number;
}

/**
 * Banniere discrete au-dessus de la pile de taches du jour (retour
 * utilisateur, 2026-09-23) : nouvelles annonces d'autres comptes depuis le
 * dernier passage sur /boutures, messages non lus, et echanges a noter.
 * "Ignorer" n'acquitte que les nouvelles annonces (ne reviennent qu'avec la
 * prochaine) -- un message non lu ou une note a donner reste un vrai "a
 * faire", la banniere revient donc au prochain chargement tant qu'il en reste.
 */
export default function CuttingsBanner() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    fetch("/api/cuttings/notifications")
      .then((res) => (res.ok ? res.json() : { newListings: 0, unreadMessages: 0, ratingsToGive: 0, warnings: 0 }))
      .then((data) => setCounts({ newListings: data.newListings ?? 0, unreadMessages: data.unreadMessages ?? 0, ratingsToGive: data.ratingsToGive ?? 0, warnings: data.warnings ?? 0 }))
      .catch(() => setCounts({ newListings: 0, unreadMessages: 0, ratingsToGive: 0, warnings: 0 }));
  }, []);

  if (!counts || hidden || (counts.newListings === 0 && counts.unreadMessages === 0 && counts.ratingsToGive === 0 && counts.warnings === 0)) return null;

  async function dismiss() {
    setHidden(true);
    try {
      await fetch("/api/cuttings/notifications", { method: "POST" });
    } catch {
      // Best-effort : la banniere reste masquee pour cette visite.
    }
  }

  const { newListings, unreadMessages, ratingsToGive, warnings } = counts;
  // Ce qui attend une action l'emporte : avertissement a lire, messages, puis notes a donner.
  const href = warnings > 0 ? "/boutures" : unreadMessages > 0 ? "/boutures?tab=messages" : ratingsToGive > 0 ? "/boutures?tab=echanges" : "/boutures";
  const Icon = warnings > 0 ? TriangleAlert : unreadMessages > 0 ? MessageCircle : Leaf;

  return (
    <div className="card flex items-center gap-3 p-3.5" style={{ borderLeft: "3px solid var(--accent)" }}>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }}
      >
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        {warnings > 0 && (
          <p className="font-semibold" style={{ color: "var(--danger)" }}>
            Tu as reçu un avertissement de l&apos;administrateur.
          </p>
        )}
        {unreadMessages > 0 && (
          <p>
            {unreadMessages} message{unreadMessages > 1 ? "s" : ""} non lu{unreadMessages > 1 ? "s" : ""} sur les boutures.
          </p>
        )}
        {ratingsToGive > 0 && (
          <p>
            {ratingsToGive} échange{ratingsToGive > 1 ? "s" : ""} à noter.
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
