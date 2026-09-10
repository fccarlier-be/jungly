"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StickyNote, type LucideIcon } from "lucide-react";
import { CARE_ICON, CARE_COLOR } from "@/components/careIcons";

interface CareRuleLite {
  id: string;
  type: string;
  configuration?: { waterAmount?: number; waterUnit?: string; fertilizerId?: string; dosagePerLiter?: number } | null;
}

const inputClass = "input w-full px-3 py-2";

export default function QuickActions({ plantId, careRules }: { plantId: string; careRules: CareRuleLite[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wateringRule = careRules.find((r) => r.type === "WATERING");
  const fertilizingRule = careRules.find((r) => r.type === "FERTILIZING");

  const [waterQty, setWaterQty] = useState(wateringRule?.configuration?.waterAmount?.toString() ?? "");
  const [waterUnit, setWaterUnit] = useState(wateringRule?.configuration?.waterUnit ?? "L");
  const [waterNote, setWaterNote] = useState("");

  const [fertQty, setFertQty] = useState("");
  const [fertNote, setFertNote] = useState("");

  const [repotDiameter, setRepotDiameter] = useState("");
  const [repotSubstrate, setRepotSubstrate] = useState("");
  const [repotNote, setRepotNote] = useState("");

  const [pruneNote, setPruneNote] = useState("");
  const [inspectNote, setInspectNote] = useState("");

  const [noteContent, setNoteContent] = useState("");
  const [noteCategory, setNoteCategory] = useState("OBSERVATION");

  function toggle(key: string) {
    setOpen((current) => (current === key ? null : key));
  }

  async function run(fn: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await fn();
      setOpen(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setPending(false);
    }
  }

  async function throwIfNotOk(res: Response, fallbackMessage: string) {
    if (res.ok) return;
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? fallbackMessage);
  }

  const submitWater = () =>
    run(async () => {
      const res = await fetch(`/api/plants/${plantId}/water`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: waterQty ? Number(waterQty) : undefined,
          unit: waterUnit,
          note: waterNote || undefined,
          careRuleId: wateringRule?.id,
        }),
      });
      await throwIfNotOk(res, "Impossible d'enregistrer l'arrosage.");
      setWaterNote("");
    });

  const submitFertilize = () =>
    run(async () => {
      const res = await fetch(`/api/plants/${plantId}/fertilize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: fertQty ? Number(fertQty) : undefined,
          fertilizerId: fertilizingRule?.configuration?.fertilizerId,
          dosagePerLiter: fertilizingRule?.configuration?.dosagePerLiter,
          note: fertNote || undefined,
          careRuleId: fertilizingRule?.id,
        }),
      });
      await throwIfNotOk(res, "Impossible d'enregistrer la fertilisation.");
      setFertNote("");
    });

  const submitRepot = () =>
    run(async () => {
      const res = await fetch(`/api/plants/${plantId}/repot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPotDiameterMm: repotDiameter ? Number(repotDiameter) : undefined,
          substrate: repotSubstrate || undefined,
          note: repotNote || undefined,
        }),
      });
      await throwIfNotOk(res, "Impossible d'enregistrer le rempotage.");
      setRepotNote("");
    });

  const submitGeneric = (type: "PRUNING" | "INSPECTION", note: string, reset: () => void) =>
    run(async () => {
      const res = await fetch(`/api/plants/${plantId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, note: note || undefined }),
      });
      await throwIfNotOk(res, "Impossible d'enregistrer cet événement.");
      reset();
    });

  const submitNote = () =>
    run(async () => {
      const res = await fetch(`/api/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantId, content: noteContent, category: noteCategory }),
      });
      await throwIfNotOk(res, "Impossible d'ajouter cette note.");
      setNoteContent("");
    });

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <ActionButton icon={CARE_ICON.WATERING} color={CARE_COLOR.WATERING} label="Arroser" active={open === "water"} onClick={() => toggle("water")} />
        <ActionButton icon={CARE_ICON.FERTILIZING} color={CARE_COLOR.FERTILIZING} label="Fertiliser" active={open === "fertilize"} onClick={() => toggle("fertilize")} />
        <ActionButton icon={CARE_ICON.REPOTTING} color={CARE_COLOR.REPOTTING} label="Rempoter" active={open === "repot"} onClick={() => toggle("repot")} />
        <ActionButton icon={CARE_ICON.PRUNING} color={CARE_COLOR.PRUNING} label="Tailler" active={open === "prune"} onClick={() => toggle("prune")} />
        <ActionButton icon={CARE_ICON.INSPECTION} color={CARE_COLOR.INSPECTION} label="Inspection" active={open === "inspect"} onClick={() => toggle("inspect")} />
        <ActionButton icon={StickyNote} label="Note" active={open === "note"} onClick={() => toggle("note")} />
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {open === "water" && (
        <div className="card p-3 space-y-2">
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              step="0.1"
              placeholder="Quantité"
              value={waterQty}
              onChange={(e) => setWaterQty(e.target.value)}
              className={inputClass}
            />
            <select value={waterUnit} onChange={(e) => setWaterUnit(e.target.value)} className={inputClass} style={{ maxWidth: 90 }}>
              <option value="L">L</option>
              <option value="ml">ml</option>
            </select>
          </div>
          <input
            placeholder="Note (optionnel)"
            value={waterNote}
            onChange={(e) => setWaterNote(e.target.value)}
            className={inputClass}
          />
          <button onClick={submitWater} disabled={pending} className="btn-primary w-full rounded-lg py-2 text-sm font-medium">
            Confirmer l&apos;arrosage
          </button>
        </div>
      )}

      {open === "fertilize" && (
        <div className="card p-3 space-y-2">
          <input
            type="number"
            min={0}
            step="0.1"
            placeholder="Quantité (ml/g), laisser vide pour calcul auto"
            value={fertQty}
            onChange={(e) => setFertQty(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Note (optionnel)"
            value={fertNote}
            onChange={(e) => setFertNote(e.target.value)}
            className={inputClass}
          />
          <button onClick={submitFertilize} disabled={pending} className="btn-primary w-full rounded-lg py-2 text-sm font-medium">
            Confirmer la fertilisation
          </button>
        </div>
      )}

      {open === "repot" && (
        <div className="card p-3 space-y-2">
          <input
            type="number"
            min={1}
            placeholder="Nouveau diamètre (mm)"
            value={repotDiameter}
            onChange={(e) => setRepotDiameter(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Nouveau substrat"
            value={repotSubstrate}
            onChange={(e) => setRepotSubstrate(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Note (optionnel)"
            value={repotNote}
            onChange={(e) => setRepotNote(e.target.value)}
            className={inputClass}
          />
          <button onClick={submitRepot} disabled={pending} className="btn-primary w-full rounded-lg py-2 text-sm font-medium">
            Confirmer le rempotage
          </button>
        </div>
      )}

      {open === "prune" && (
        <div className="card p-3 space-y-2">
          <input
            placeholder="Note (optionnel)"
            value={pruneNote}
            onChange={(e) => setPruneNote(e.target.value)}
            className={inputClass}
          />
          <button
            onClick={() => submitGeneric("PRUNING", pruneNote, () => setPruneNote(""))}
            disabled={pending}
            className="btn-primary w-full rounded-lg py-2 text-sm font-medium"
          >
            Confirmer la taille
          </button>
        </div>
      )}

      {open === "inspect" && (
        <div className="card p-3 space-y-2">
          <input
            placeholder="Observation (optionnel)"
            value={inspectNote}
            onChange={(e) => setInspectNote(e.target.value)}
            className={inputClass}
          />
          <button
            onClick={() => submitGeneric("INSPECTION", inspectNote, () => setInspectNote(""))}
            disabled={pending}
            className="btn-primary w-full rounded-lg py-2 text-sm font-medium"
          >
            Confirmer l&apos;inspection
          </button>
        </div>
      )}

      {open === "note" && (
        <div className="card p-3 space-y-2">
          <select value={noteCategory} onChange={(e) => setNoteCategory(e.target.value)} className={inputClass}>
            <option value="OBSERVATION">Observation</option>
            <option value="MALADIE">Maladie</option>
            <option value="PARASITE">Parasite</option>
            <option value="CROISSANCE">Croissance</option>
            <option value="FLORAISON">Floraison</option>
            <option value="AUTRE">Autre</option>
          </select>
          <textarea
            placeholder="Votre note"
            rows={3}
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            className={inputClass}
          />
          <button
            onClick={submitNote}
            disabled={pending || !noteContent.trim()}
            className="btn-primary w-full rounded-lg py-2 text-sm font-medium disabled:opacity-60"
          >
            Ajouter la note
          </button>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  color,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  color?: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="card flex flex-col items-center gap-1.5 py-3.5 text-xs font-medium"
      style={active ? { borderColor: "var(--primary)", background: "var(--primary-soft)", color: "var(--primary-strong)" } : undefined}
    >
      <Icon size={20} strokeWidth={2} style={{ color: active ? undefined : color }} />
      {label}
    </button>
  );
}
