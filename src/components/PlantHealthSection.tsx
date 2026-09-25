"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Stethoscope } from "@/components/icons";
import { HealthDot, HealthLevelPicker, SymptomPicker } from "@/components/HealthLevelPicker";
import { HEALTH_COLOR, type HealthLevel } from "@/lib/plantHealth";
import type { HealthView } from "@/lib/plantDetailData";
import type { SymptomCategory } from "@/server/diagnosis/types";

/**
 * Section "Sante" de la fiche plante : dernier releve, tendance, frise des
 * releves precedents, et formulaire de nouveau releve (enregistre comme une
 * INSPECTION, voir /api/plants/:id/events).
 */
export default function PlantHealthSection({ plantId, health }: { plantId: string; health: HealthView | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<HealthLevel | null>(null);
  const [symptoms, setSymptoms] = useState<SymptomCategory[]>([]);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!level) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/plants/${plantId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "INSPECTION", healthLevel: level, symptoms, note: note || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Impossible d'enregistrer ce relevé.");
      }
      setOpen(false);
      setLevel(null);
      setSymptoms([]);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="animate-rise-in space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Santé</h2>
        {/* Meme style que le bouton "+ Photo" de la galerie (PlantPhotoGallery) :
            un simple texte colore ne se lisait pas comme un bouton (retour
            utilisateur, 2026-09-25). */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`${open ? "btn-ghost" : "btn-primary"} inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold whitespace-nowrap`}
        >
          {!open && <Plus size={12} />}
          {open ? "Annuler" : health ? "Nouveau relevé" : "Noter son état"}
        </button>
      </div>

      {health ? (
        <div className="card space-y-3 p-4 text-sm">
          <div className="flex items-center gap-2.5">
            <HealthDot level={health.level} size={14} />
            <span className="text-base font-semibold" style={{ color: HEALTH_COLOR[health.level] }}>
              {health.label}
            </span>
            <span className="text-muted">
              · {health.dateLabel}
              {health.trendLabel && ` · ${health.trendLabel}`}
            </span>
          </div>
          {health.symptomLabels.length > 0 && <p className="text-muted">Symptômes : {health.symptomLabels.join(", ")}</p>}
          {health.note && <p className="text-muted whitespace-pre-wrap">{health.note}</p>}
          {health.nextFollowUpLabel && <p className="text-muted">Prochaine inspection de suivi : {health.nextFollowUpLabel.toLowerCase()}</p>}

          {health.history.length > 1 && (
            <div className="flex items-center gap-1.5" aria-label="Évolution des derniers relevés">
              {health.history.map((h, i) => (
                <span key={i} title={`${h.dateLabel} : ${h.label}`}>
                  <HealthDot level={h.level} size={12} />
                </span>
              ))}
            </div>
          )}

          {health.sick && (
            <Link
              href={`/plantes/${plantId}/diagnostic`}
              className="btn-secondary flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium"
            >
              <Stethoscope size={16} /> Lancer un diagnostic
            </Link>
          )}
        </div>
      ) : (
        !open && <p className="text-muted text-sm">Aucun relevé de santé pour l&apos;instant.</p>
      )}

      {open && (
        <div className="card space-y-3 p-3">
          <HealthLevelPicker value={level} onChange={setLevel} disabled={pending} />
          <SymptomPicker value={symptoms} onChange={setSymptoms} disabled={pending} />
          <input placeholder="Observation (optionnel)" value={note} onChange={(e) => setNote(e.target.value)} className="input w-full px-3 py-2" />
          {error && (
            <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <button onClick={submit} disabled={pending || !level} className="btn-primary w-full rounded-lg py-2 text-sm font-medium disabled:opacity-60">
            Enregistrer le relevé
          </button>
        </div>
      )}
    </section>
  );
}
