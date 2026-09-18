"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Impossible de réinitialiser le mot de passe.");
        return;
      }
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="card w-full max-w-sm space-y-4 p-6 text-center text-sm">
        <p>Ce lien de réinitialisation est incomplet.</p>
        <Link href="/mot-de-passe-oublie" className="font-medium" style={{ color: "var(--primary-strong)" }}>
          Demander un nouveau lien
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card w-full max-w-sm space-y-4 p-6 text-center text-sm">
        <p>Mot de passe mis à jour.</p>
        <Link href="/login" className="font-medium" style={{ color: "var(--primary-strong)" }}>
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card w-full max-w-sm space-y-4 p-6">
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">
          Nouveau mot de passe
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input w-full px-3 py-2"
        />
        <p className="text-muted text-xs">8 caractères minimum.</p>
      </div>

      <div className="space-y-1">
        <label htmlFor="confirmPassword" className="text-sm font-medium">
          Confirmer le mot de passe
        </label>
        <input
          id="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="input w-full px-3 py-2"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full rounded-xl py-2.5 font-semibold disabled:opacity-60">
        {loading ? "Enregistrement..." : "Réinitialiser le mot de passe"}
      </button>
    </form>
  );
}
