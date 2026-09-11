"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UnitSystem } from "@/lib/units";

export default function UnitSettings({ initial }: { initial: UnitSystem }) {
  const router = useRouter();
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: UnitSystem) {
    if (next === unitSystem || saving) return;
    const previous = unitSystem;
    setUnitSystem(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitSystem: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Impossible de mettre à jour les unités.");
      }
      router.refresh();
    } catch (err) {
      setUnitSystem(previous);
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSaving(false);
    }
  }

  const options: { value: UnitSystem; label: string; hint: string }[] = [
    { value: "METRIC", label: "Métrique", hint: "mm/cm, ml/L" },
    { value: "IMPERIAL", label: "Impérial", hint: "in, fl oz" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => choose(opt.value)}
            disabled={saving}
            className={`chip flex-1 rounded-xl py-2 text-sm disabled:opacity-60 ${unitSystem === opt.value ? "chip-active" : ""}`}
          >
            {opt.label}
            <span className="block text-xs opacity-70">{opt.hint}</span>
          </button>
        ))}
      </div>
      {error && (
        <p className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
