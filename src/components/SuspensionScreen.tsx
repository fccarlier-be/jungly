import { Ban } from "lucide-react";
import type { MemberWarning } from "@/server/cuttings/moderation";
import WarningCards from "@/components/WarningCards";

/** Ecran affiche a la place du don/echange pendant la suspension d'un membre. */
export default function SuspensionScreen({ until, warnings }: { until: Date; warnings: MemberWarning[] }) {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">Boutures</h1>
      <section className="card flex gap-3 p-4" style={{ borderLeft: "3px solid var(--danger)" }}>
        <Ban size={20} className="mt-0.5 shrink-0" style={{ color: "var(--danger)" }} aria-hidden />
        <div className="space-y-1 text-sm">
          <p className="font-semibold">Ton accès au don/échange de boutures est suspendu jusqu&apos;au {until.toLocaleDateString("fr-BE")}.</p>
          <p className="text-muted">
            Cette suspension fait suite à des avertissements de l&apos;administrateur. Le reste de l&apos;application reste utilisable. Un
            nouveau manquement peut entraîner une suspension plus longue, voire un bannissement définitif.
          </p>
        </div>
      </section>
      {warnings.length > 0 && <WarningCards warnings={warnings} />}
    </div>
  );
}
