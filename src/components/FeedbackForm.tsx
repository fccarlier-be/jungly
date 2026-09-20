"use client";

import { useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { bypassesImageOptimizer } from "@/lib/imageOptimization";

const TOPIC_OPTIONS: { value: string; label: string }[] = [
  { value: "ACCUEIL", label: "Accueil" },
  { value: "TACHES", label: "Tâches" },
  { value: "PLANTES", label: "Mes plantes" },
  { value: "PARAMETRES", label: "Paramètres" },
  { value: "BIBLIOTHEQUE", label: "Bibliothèque" },
  { value: "ENGRAIS", label: "Engrais" },
  { value: "AUTRE", label: "Autre" },
];

export default function FeedbackForm() {
  const [content, setContent] = useState("");
  const [topic, setTopic] = useState("AUTRE");
  const [anonymous, setAnonymous] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Téléversement impossible.");
      const data = await res.json();
      setPhotoUrl(data.url);
    } catch {
      setError("Impossible de téléverser la capture d'écran.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, topic, anonymous, photoUrl: photoUrl || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Une erreur est survenue.");
        return;
      }
      setSent(true);
      setContent("");
      setTopic("AUTRE");
      setAnonymous(false);
      setPhotoUrl("");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="card space-y-3 p-4 text-sm">
        <p style={{ color: "var(--primary-strong)" }}>Merci, ton retour a bien été envoyé !</p>
        <button type="button" onClick={() => setSent(false)} className="chip rounded-xl px-3 py-2 text-sm">
          Envoyer un autre retour
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-3 p-4">
      <div className="space-y-1">
        <label htmlFor="feedback-topic" className="text-sm font-medium">
          Ça concerne quoi ?
        </label>
        <select id="feedback-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="input w-full px-3 py-2 text-sm">
          {TOPIC_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="feedback-content" className="text-sm font-medium">
          Ton retour
        </label>
        <textarea
          id="feedback-content"
          required
          minLength={1}
          maxLength={4000}
          rows={6}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Un bug, une idée, une remarque..."
          className="input w-full px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <span className="text-sm font-medium">Capture d&apos;écran (optionnel)</span>
        {photoUrl ? (
          <div className="relative h-32 w-full overflow-hidden rounded-xl" style={{ background: "var(--surface-alt)" }}>
            <Image src={photoUrl} alt="" fill sizes="100vw" className="object-contain" unoptimized={bypassesImageOptimizer(photoUrl)} />
            <button
              type="button"
              onClick={() => setPhotoUrl("")}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full"
              style={{ background: "var(--surface)", color: "var(--ink)" }}
              aria-label="Retirer la capture d'écran"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <label className="text-sm">
            <span className="chip inline-block cursor-pointer rounded-xl px-3 py-2">
              {uploading ? "Téléversement..." : "Ajouter une capture d'écran"}
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={uploading} />
          </label>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        Envoyer anonymement (ton compte ne sera pas associé à ce retour)
      </label>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || uploading || !content.trim()}
        className="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {loading ? "Envoi..." : "Envoyer"}
      </button>
    </form>
  );
}
