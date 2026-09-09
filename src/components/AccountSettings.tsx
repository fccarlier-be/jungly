"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AccountSettings({ email, initialName }: { email?: string | null; initialName?: string | null }) {
  const { update } = useSession();
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim() || name.trim() === initialName) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Impossible de mettre à jour le nom.");
      await update({ name: body.name });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      {email && <p className="text-muted text-sm">{email}</p>}
      <div>
        <label htmlFor="account-name" className="mb-1 block text-sm font-medium">
          Nom affiché
        </label>
        <div className="flex gap-2">
          <input
            id="account-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            placeholder="Ton prénom"
            className="input min-w-0 flex-1 px-3 py-2 text-sm"
          />
          <button
            onClick={save}
            disabled={saving || !name.trim() || name.trim() === initialName}
            className="btn-primary shrink-0 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {saving ? "..." : "Enregistrer"}
          </button>
        </div>
        {error && (
          <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="mt-1 text-xs" style={{ color: "var(--primary-strong)" }}>
            Nom mis à jour.
          </p>
        )}
      </div>
    </div>
  );
}
