"use client";

import { useState } from "react";

export default function FeedbackForm() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Une erreur est survenue.");
        return;
      }
      setSent(true);
      setContent("");
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

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !content.trim()}
        className="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {loading ? "Envoi..." : "Envoyer"}
      </button>
    </form>
  );
}
