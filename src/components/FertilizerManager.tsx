"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface FertilizerRecord {
  id: string;
  name: string;
  manufacturer: string | null;
  type: string | null;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  defaultDosage: number | null;
  dosageUnit: string | null;
  notes: string | null;
}

const inputClass = "input w-full px-3 py-2 text-sm";
const labelClass = "text-xs font-medium block mb-1";

interface FormState {
  name: string;
  manufacturer: string;
  type: string;
  nitrogen: string;
  phosphorus: string;
  potassium: string;
  defaultDosage: string;
  dosageUnit: "ml" | "g";
  notes: string;
}

const emptyForm: FormState = {
  name: "",
  manufacturer: "",
  type: "",
  nitrogen: "",
  phosphorus: "",
  potassium: "",
  defaultDosage: "",
  dosageUnit: "ml",
  notes: "",
};

export default function FertilizerManager({ fertilizers }: { fertilizers: FertilizerRecord[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startAdd() {
    setForm(emptyForm);
    setEditingId(null);
    setAdding(true);
  }

  function startEdit(fert: FertilizerRecord) {
    setForm({
      name: fert.name,
      manufacturer: fert.manufacturer ?? "",
      type: fert.type ?? "",
      nitrogen: fert.nitrogen?.toString() ?? "",
      phosphorus: fert.phosphorus?.toString() ?? "",
      potassium: fert.potassium?.toString() ?? "",
      defaultDosage: fert.defaultDosage?.toString() ?? "",
      dosageUnit: (fert.dosageUnit as "ml" | "g") ?? "ml",
      notes: fert.notes ?? "",
    });
    setEditingId(fert.id);
    setAdding(true);
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
    setError(null);
  }

  async function save() {
    if (!form.name.trim()) {
      setError("Le nom est requis.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        manufacturer: form.manufacturer.trim() || undefined,
        type: form.type.trim() || undefined,
        nitrogen: form.nitrogen ? Number(form.nitrogen) : undefined,
        phosphorus: form.phosphorus ? Number(form.phosphorus) : undefined,
        potassium: form.potassium ? Number(form.potassium) : undefined,
        defaultDosage: form.defaultDosage ? Number(form.defaultDosage) : undefined,
        dosageUnit: form.defaultDosage ? form.dosageUnit : undefined,
        notes: form.notes.trim() || undefined,
      };

      const res = editingId
        ? await fetch(`/api/fertilizers/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/fertilizers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Enregistrement impossible.");
      }

      setAdding(false);
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Supprimer cet engrais ? Les règles de fertilisation qui l'utilisent perdront cette référence.")) {
      return;
    }
    await fetch(`/api/fertilizers/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {fertilizers.length === 0 && !adding && <p className="text-muted text-sm">Aucun engrais enregistré pour l&apos;instant.</p>}

      {fertilizers.map((fert) => (
        <div key={fert.id} className="card p-3 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{fert.name}</p>
              <p className="text-muted text-xs">
                {fert.manufacturer && `${fert.manufacturer} · `}
                {fert.nitrogen != null && fert.phosphorus != null && fert.potassium != null
                  ? `NPK ${fert.nitrogen}-${fert.phosphorus}-${fert.potassium}`
                  : null}
                {fert.defaultDosage != null && ` · ${fert.defaultDosage} ${fert.dosageUnit ?? "ml"}/L`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(fert)} className="chip rounded-lg px-2.5 py-1 text-xs">
                Modifier
              </button>
              <button onClick={() => remove(fert.id)} className="chip rounded-lg px-2.5 py-1 text-xs" style={{ color: "var(--danger)" }}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      ))}

      {!adding && (
        <button onClick={startAdd} className="chip w-full rounded-xl py-2.5 text-sm font-medium">
          + Ajouter un engrais
        </button>
      )}

      {adding && (
        <div className="card space-y-2 p-3">
          {error && (
            <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <div>
            <label className={labelClass}>Nom *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Fabricant</label>
              <input
                value={form.manufacturer}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Type</label>
              <input
                placeholder="liquide, granules..."
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>NPK</label>
            <div className="grid grid-cols-3 gap-2">
              <input
                placeholder="N"
                type="number"
                min={0}
                value={form.nitrogen}
                onChange={(e) => setForm({ ...form, nitrogen: e.target.value })}
                className={inputClass}
              />
              <input
                placeholder="P"
                type="number"
                min={0}
                value={form.phosphorus}
                onChange={(e) => setForm({ ...form, phosphorus: e.target.value })}
                className={inputClass}
              />
              <input
                placeholder="K"
                type="number"
                min={0}
                value={form.potassium}
                onChange={(e) => setForm({ ...form, potassium: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Dosage recommande (par litre)</label>
              <input
                type="number"
                min={0}
                step="0.1"
                value={form.defaultDosage}
                onChange={(e) => setForm({ ...form, defaultDosage: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Unite</label>
              <select
                value={form.dosageUnit}
                onChange={(e) => setForm({ ...form, dosageUnit: e.target.value as "ml" | "g" })}
                className={inputClass}
              >
                <option value="ml">ml</option>
                <option value="g">g</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving} className="btn-primary flex-1 rounded-xl py-2 text-sm font-semibold disabled:opacity-60">
              {saving ? "..." : editingId ? "Enregistrer" : "Ajouter"}
            </button>
            <button onClick={cancel} className="chip rounded-xl px-4 py-2 text-sm">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
