"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ContainerRecord {
  id: string;
  name: string;
  potShape: "ROUND" | "RECTANGULAR";
  potDiameterMm: number | null;
  potLengthMm: number | null;
  potWidthMm: number | null;
  potHeightMm: number | null;
  potMaterial: string | null;
  _count: { plants: number };
}

const inputClass = "input w-full px-3 py-2 text-sm";
const labelClass = "text-xs font-medium block mb-1";

interface FormState {
  name: string;
  potShape: "ROUND" | "RECTANGULAR";
  potDiameterMm: string;
  potLengthMm: string;
  potWidthMm: string;
  potHeightMm: string;
  potMaterial: string;
}

const emptyForm: FormState = {
  name: "",
  potShape: "RECTANGULAR",
  potDiameterMm: "",
  potLengthMm: "",
  potWidthMm: "",
  potHeightMm: "",
  potMaterial: "",
};

function describe(c: ContainerRecord): string {
  const size =
    c.potShape === "RECTANGULAR"
      ? c.potLengthMm && c.potWidthMm
        ? `${c.potLengthMm} x ${c.potWidthMm} mm`
        : null
      : c.potDiameterMm
        ? `Ø ${c.potDiameterMm} mm`
        : null;
  const parts = [size, c.potMaterial, `${c._count.plants} plante${c._count.plants > 1 ? "s" : ""}`].filter(Boolean);
  return parts.join(" · ");
}

export default function ContainerManager({ containers }: { containers: ContainerRecord[] }) {
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

  function startEdit(c: ContainerRecord) {
    setForm({
      name: c.name,
      potShape: c.potShape,
      potDiameterMm: c.potDiameterMm?.toString() ?? "",
      potLengthMm: c.potLengthMm?.toString() ?? "",
      potWidthMm: c.potWidthMm?.toString() ?? "",
      potHeightMm: c.potHeightMm?.toString() ?? "",
      potMaterial: c.potMaterial ?? "",
    });
    setEditingId(c.id);
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
        potShape: form.potShape,
        potDiameterMm: form.potShape === "ROUND" ? (form.potDiameterMm ? Number(form.potDiameterMm) : undefined) : null,
        potLengthMm: form.potShape === "RECTANGULAR" ? (form.potLengthMm ? Number(form.potLengthMm) : undefined) : null,
        potWidthMm: form.potShape === "RECTANGULAR" ? (form.potWidthMm ? Number(form.potWidthMm) : undefined) : null,
        potHeightMm: form.potHeightMm ? Number(form.potHeightMm) : undefined,
        potMaterial: form.potMaterial.trim() || undefined,
      };

      const res = editingId
        ? await fetch(`/api/containers/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/containers", {
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
    if (
      !window.confirm(
        "Supprimer cette jardinière ? Les plantes qu'elle contient redeviendront des plantes en pot individuel (à renseigner à nouveau).",
      )
    ) {
      return;
    }
    setError(null);
    const res = await fetch(`/api/containers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Suppression impossible.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && !adding && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {containers.length === 0 && !adding && (
        <p className="text-muted text-sm">Aucune jardinière enregistrée pour l&apos;instant.</p>
      )}

      {containers.map((c) => (
        <div key={c.id} className="card p-3 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-muted text-xs">{describe(c)}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(c)} className="chip rounded-lg px-2.5 py-1 text-xs">
                Modifier
              </button>
              <button onClick={() => remove(c.id)} className="chip rounded-lg px-2.5 py-1 text-xs" style={{ color: "var(--danger)" }}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      ))}

      {!adding && (
        <button onClick={startAdd} className="chip w-full rounded-xl py-2.5 text-sm font-medium">
          + Ajouter une jardinière
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
            <input
              placeholder="Jardinière du balcon"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Forme</label>
            <select
              value={form.potShape}
              onChange={(e) => setForm({ ...form, potShape: e.target.value as "ROUND" | "RECTANGULAR" })}
              className={inputClass}
            >
              <option value="RECTANGULAR">Rectangulaire / jardinière</option>
              <option value="ROUND">Rond</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {form.potShape === "ROUND" ? (
              <div>
                <label className={labelClass}>Diamètre (mm)</label>
                <input
                  type="number"
                  min={1}
                  value={form.potDiameterMm}
                  onChange={(e) => setForm({ ...form, potDiameterMm: e.target.value })}
                  className={inputClass}
                />
              </div>
            ) : (
              <>
                <div>
                  <label className={labelClass}>Longueur (mm)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.potLengthMm}
                    onChange={(e) => setForm({ ...form, potLengthMm: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Largeur (mm)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.potWidthMm}
                    onChange={(e) => setForm({ ...form, potWidthMm: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </>
            )}
            <div>
              <label className={labelClass}>Hauteur (mm)</label>
              <input
                type="number"
                min={1}
                value={form.potHeightMm}
                onChange={(e) => setForm({ ...form, potHeightMm: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Matériau</label>
            <input
              value={form.potMaterial}
              onChange={(e) => setForm({ ...form, potMaterial: e.target.value })}
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
