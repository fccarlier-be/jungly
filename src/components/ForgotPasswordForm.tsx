"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Une erreur est survenue.");
        return;
      }
      setMessage(body.message);
    } finally {
      setLoading(false);
    }
  }

  if (message) {
    return (
      <div className="card w-full max-w-sm space-y-4 p-6 text-center text-sm">
        <p>{message}</p>
        <Link href="/login" className="font-medium" style={{ color: "var(--primary-strong)" }}>
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card w-full max-w-sm space-y-4 p-6">
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input w-full px-3 py-2"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full rounded-xl py-2.5 font-semibold disabled:opacity-60">
        {loading ? "Envoi..." : "Envoyer le lien de réinitialisation"}
      </button>

      <p className="text-muted text-center text-sm">
        <Link href="/login" className="font-medium" style={{ color: "var(--primary-strong)" }}>
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}
