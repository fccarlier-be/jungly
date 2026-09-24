"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "@/components/icons";

/**
 * Choix/modification du pseudo public (voir User.pseudo) -- sans lui, un
 * compte ne peut ni publier ni ecrire aux autres membres. `required`
 * affiche la version "bloquante" (aucun pseudo encore), sinon une simple
 * ligne discrete avec un bouton pour le modifier.
 */
export default function PseudoForm({ initialPseudo, required = false }: { initialPseudo: string | null; required?: boolean }) {
  const router = useRouter();
  const [pseudo, setPseudo] = useState(initialPseudo ?? "");
  const [editing, setEditing] = useState(required);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/cuttings/pseudo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pseudo }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.details?.fieldErrors?.pseudo?.[0] ?? body.error ?? "Impossible d'enregistrer le pseudo.");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <p className="text-muted flex items-center gap-2 text-sm">
        <UserRound size={15} />
        Ton pseudo : <strong style={{ color: "var(--ink)" }}>{initialPseudo}</strong>
        <button type="button" onClick={() => setEditing(true)} className="underline underline-offset-2">
          modifier
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={save} className="card space-y-2 p-4">
      <p className="text-sm font-semibold">{required ? "Choisis ton pseudo" : "Modifier ton pseudo"}</p>
      <p className="text-muted text-xs">
        Les autres membres verront ce pseudo (jamais ton nom ni ton email) sur tes annonces et dans les messages.
      </p>
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <input
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value)}
          minLength={3}
          maxLength={24}
          required
          placeholder="Ex. Léa du balcon"
          aria-label="Pseudo"
          className="input flex-1"
        />
        <button type="submit" disabled={saving || pseudo.trim().length < 3} className="btn-primary shrink-0 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60">
          {saving ? "..." : "Enregistrer"}
        </button>
        {!required && (
          <button type="button" onClick={() => setEditing(false)} className="btn-ghost shrink-0 rounded-lg px-3 py-2 text-sm">
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
