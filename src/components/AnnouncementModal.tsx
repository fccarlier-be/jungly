"use client";

import { useState } from "react";
import { Megaphone } from "@/components/icons";

export interface AnnouncementModalData {
  id: string;
  title: string;
  body: string;
}

/**
 * Modale de nouveautes, affichee au chargement quand User.lastSeenAnnouncementId
 * differe de la derniere annonce publiee (voir layout.tsx et
 * server/announcements.ts). Fermer sans cocher la case ne persiste rien : la
 * modale reapparaitra au prochain chargement (comportement voulu, pas un
 * bug -- voir la discussion produit du 2026-09-23). Cocher la case avant de
 * fermer l'acquitte cote serveur, elle ne reapparaitra plus jusqu'a la
 * PROCHAINE annonce publiee.
 */
export default function AnnouncementModal({ announcement }: { announcement: AnnouncementModalData }) {
  const [visible, setVisible] = useState(true);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!visible) return null;

  async function close() {
    if (!dontShowAgain) {
      setVisible(false);
      return;
    }
    setSubmitting(true);
    try {
      await fetch("/api/announcements/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ announcementId: announcement.id }),
      });
    } catch {
      // Best-effort : si l'appel echoue (reseau), la modale se refermera
      // quand meme pour cette visite -- elle reapparaitra simplement au
      // prochain chargement, ce qui reste le comportement "case non cochee".
    } finally {
      setVisible(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcement-title"
    >
      <div className="card w-full max-w-sm space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span
            className="icon-disc flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          >
            <Megaphone size={20} />
          </span>
          <div className="min-w-0 space-y-1 pt-1">
            <h2 id="announcement-title" className="font-display text-lg font-semibold leading-tight">
              {announcement.title}
            </h2>
          </div>
        </div>

        <p className="whitespace-pre-line text-sm leading-relaxed">{announcement.body}</p>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="h-4 w-4"
          />
          Ne plus afficher cette annonce
        </label>

        <button
          type="button"
          onClick={close}
          disabled={submitting}
          className="btn-primary w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          Compris
        </button>
      </div>
    </div>
  );
}
