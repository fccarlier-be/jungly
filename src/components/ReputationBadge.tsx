import { Star } from "lucide-react";
import type { Reputation } from "@/server/cuttings/service";

/** Moyenne et nombre de notes recues d'un membre ("Nouveau" tant qu'aucun echange n'a ete note). */
export default function ReputationBadge({ reputation }: { reputation?: Reputation }) {
  if (!reputation || reputation.count === 0 || reputation.average === null) {
    return <span className="text-muted text-xs">Nouveau membre</span>;
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs" title={`${reputation.count} note${reputation.count > 1 ? "s" : ""} reçue${reputation.count > 1 ? "s" : ""}`}>
      <Star size={12} fill="var(--warning)" stroke="var(--warning)" />
      <strong>{reputation.average.toFixed(1)}</strong>
      <span className="text-muted">({reputation.count})</span>
    </span>
  );
}
