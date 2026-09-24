"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { LoginArt } from "@/components/art/paper";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Email ou mot de passe incorrect.");
      return;
    }

    window.location.href = "/";
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <LoginArt className="h-20 w-auto" />
        <h1 className="font-logo text-4xl font-bold" style={{ color: "var(--primary-strong)" }}>
          Jungly
        </h1>
        <p className="text-muted text-sm">Prends soin de tes plantes, sans y penser.</p>
      </div>

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

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium">
              Mot de passe
            </label>
            <Link href="/mot-de-passe-oublie" className="text-xs font-medium" style={{ color: "var(--primary-strong)" }}>
              Mot de passe oublié ?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input w-full px-3 py-2"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full rounded-xl py-2.5 font-semibold">
          {loading ? "Connexion..." : "Se connecter"}
        </button>

        <p className="text-muted text-center text-sm">
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="font-medium" style={{ color: "var(--primary-strong)" }}>
            Créer un compte
          </Link>
        </p>
      </form>
    </div>
  );
}
