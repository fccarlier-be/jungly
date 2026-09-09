"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CareTypeIcon, careSoftBackground } from "@/components/careIcons";

interface Rule {
  id: string;
  type: "WATERING" | "FERTILIZING" | "REPOTTING";
  enabled: boolean;
  recurrenceType: string;
  interval: number | null;
}

interface FertilizerOption {
  id: string;
  name: string;
}

const TYPE_LABEL: Record<string, string> = { WATERING: "Arrosage", FERTILIZING: "Fertilisation", REPOTTING: "Rempotage" };
const RECURRENCE_LABEL: Record<string, string> = {
  FIXED_INTERVAL_DAYS: "jours",
  INTERVAL_WEEKS: "semaines",
  INTERVAL_MONTHS: "mois",
  YEARLY: "an",
  MANUAL: "manuel",
  EXACT_DATE: "date fixe",
};

const inputClass = "input w-full px-3 py-2 text-sm";

export default function CareRulesManager({
  plantId,
  rules,
  fertilizers,
}: {
  plantId: string;
  rules: Rule[];
  fertilizers: FertilizerOption[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [newType, setNewType] = useState<"WATERING" | "FERTILIZING" | "REPOTTING">("WATERING");
  const [newRecurrence, setNewRecurrence] = useState("FIXED_INTERVAL_DAYS");
  const [newInterval, setNewInterval] = useState("7");
  const [newFertilizerId, setNewFertilizerId] = useState("");

  async function toggleEnabled(rule: Rule) {
    setPending(rule.id);
    try {
      await fetch(`/api/care-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function removeRule(rule: Rule) {
    setPending(rule.id);
    try {
      await fetch(`/api/care-rules/${rule.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function addRule() {
    setPending("new");
    try {
      await fetch("/api/care-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plantId,
          type: newType,
          enabled: true,
          recurrenceType: newRecurrence,
          interval: newRecurrence === "MANUAL" ? undefined : Number(newInterval),
          configuration: newType === "FERTILIZING" ? { fertilizerId: newFertilizerId || undefined } : undefined,
        }),
      });
      setAdding(false);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {rules.map((rule) => (
        <div key={rule.id} className="card flex items-center gap-3 p-3 text-sm">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: careSoftBackground(rule.type) }}
          >
            <CareTypeIcon type={rule.type} size={17} />
          </div>
          <div className="flex-1">
            <p className="font-medium">{TYPE_LABEL[rule.type]}</p>
            <p className="text-muted text-xs">
              {rule.recurrenceType === "MANUAL" ? "Manuel" : `Tous les ${rule.interval} ${RECURRENCE_LABEL[rule.recurrenceType]}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={rule.enabled} disabled={pending === rule.id} onChange={() => toggleEnabled(rule)} />
              Actif
            </label>
            <button
              onClick={() => removeRule(rule)}
              disabled={pending === rule.id}
              className="chip rounded-lg px-2.5 py-1 text-xs"
              style={{ color: "var(--danger)" }}
            >
              Supprimer
            </button>
          </div>
        </div>
      ))}

      {!adding && (
        <button onClick={() => setAdding(true)} className="chip w-full rounded-xl py-2.5 text-sm font-medium">
          + Ajouter une règle d&apos;entretien
        </button>
      )}

      {adding && (
        <div className="card space-y-2 p-3">
          <select value={newType} onChange={(e) => setNewType(e.target.value as typeof newType)} className={inputClass}>
            <option value="WATERING">Arrosage</option>
            <option value="FERTILIZING">Fertilisation</option>
            <option value="REPOTTING">Rempotage</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select value={newRecurrence} onChange={(e) => setNewRecurrence(e.target.value)} className={inputClass}>
              <option value="FIXED_INTERVAL_DAYS">Tous les X jours</option>
              <option value="INTERVAL_WEEKS">Toutes les X semaines</option>
              <option value="INTERVAL_MONTHS">Tous les X mois</option>
              <option value="MANUAL">Manuel</option>
            </select>
            {newRecurrence !== "MANUAL" && (
              <input
                type="number"
                min={1}
                value={newInterval}
                onChange={(e) => setNewInterval(e.target.value)}
                className={inputClass}
              />
            )}
          </div>
          {newType === "FERTILIZING" && (
            <select value={newFertilizerId} onChange={(e) => setNewFertilizerId(e.target.value)} className={inputClass}>
              <option value="">Aucun engrais</option>
              {fertilizers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <button onClick={addRule} disabled={pending === "new"} className="btn-primary flex-1 rounded-xl py-2 text-sm font-semibold">
              Ajouter
            </button>
            <button onClick={() => setAdding(false)} className="chip rounded-xl px-3 py-2 text-sm">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
