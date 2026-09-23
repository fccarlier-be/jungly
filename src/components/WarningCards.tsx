"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { CUTTING_CONSEQUENCE_LABEL, CUTTINGS_NO_SALE_RULE } from "@/server/cuttings/types";
import type { MemberWarning } from "@/server/cuttings/moderation";

/** Avertissements de l'administrateur pas encore acquittes -- affiches en alerte jusqu'au "J'ai compris". */
export default function WarningCards({ warnings }: { warnings: MemberWarning[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function acknowledge(id: string) {
    setPendingId(id);
    try {
      await fetch(`/api/cuttings/warnings/${id}/acknowledge`, { method: "POST" });
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-2.5">
      {warnings.map((w) => (
        <section key={w.id} className="card space-y-2 p-4 text-sm" style={{ borderLeft: "3px solid var(--danger)" }}>
          <p className="flex items-center gap-2 font-semibold" style={{ color: "var(--danger)" }}>
            <TriangleAlert size={16} aria-hidden />
            Avertissement n°{w.rank} de l&apos;administrateur
          </p>
          <p className="whitespace-pre-line">{w.message}</p>
          <p className="text-muted text-xs">
            {w.consequence === "NONE"
              ? "Ces avertissements s'accumulent : le 3e entraîne une suspension d'une semaine du don/échange, le 6e d'un mois, le 9e un bannissement définitif de l'application."
              : CUTTING_CONSEQUENCE_LABEL[w.consequence]}
          </p>
          <p className="text-muted text-xs">{CUTTINGS_NO_SALE_RULE}</p>
          <button
            type="button"
            onClick={() => acknowledge(w.id)}
            disabled={pendingId === w.id}
            className="btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
          >
            J&apos;ai compris
          </button>
        </section>
      ))}
    </div>
  );
}
