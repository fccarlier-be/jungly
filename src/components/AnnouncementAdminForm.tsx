"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function AnnouncementAdminForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(responseBody.error ?? "Échec de la publication.");
      setTitle("");
      setBody("");
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm" style={{ color: "var(--primary-strong)" }}>
          Annonce publiée.
        </p>
      )}
      <div>
        <label htmlFor="announcement-title" className="text-muted mb-1 block text-xs font-medium uppercase tracking-wide">
          Titre
        </label>
        <input
          id="announcement-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={120}
          className="input w-full"
        />
      </div>
      <div>
        <label htmlFor="announcement-body" className="text-muted mb-1 block text-xs font-medium uppercase tracking-wide">
          Contenu
        </label>
        <textarea
          id="announcement-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          maxLength={4000}
          rows={5}
          className="input w-full"
        />
      </div>
      <button
        type="submit"
        disabled={submitting || !title.trim() || !body.trim()}
        className="btn-primary rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {submitting ? "Publication..." : "Publier"}
      </button>
    </form>
  );
}
