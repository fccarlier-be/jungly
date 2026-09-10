"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { multiplierLabel } from "@/server/weather/multiplier";

interface GeocodeCandidate {
  name: string;
  country: string | null;
  admin1: string | null;
  latitude: number;
  longitude: number;
}

interface WeatherProfile {
  city: string;
  wateringIntervalMultiplier: number;
}

export default function WeatherSettings({ initial }: { initial: WeatherProfile | null }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initial);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setCandidates([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/weather/geocode?q=${encodeURIComponent(query.trim())}`);
        const body = await res.json();
        setCandidates(body.results ?? []);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [query]);

  async function selectCity(candidate: GeocodeCandidate) {
    setSaving(true);
    setError(null);
    try {
      const cityLabel = [candidate.name, candidate.admin1, candidate.country].filter(Boolean).join(", ");
      const res = await fetch("/api/weather-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: cityLabel, latitude: candidate.latitude, longitude: candidate.longitude }),
      });
      if (!res.ok) throw new Error("Impossible d'activer l'ajustement météo.");
      const updated = await res.json();
      setProfile(updated);
      setQuery("");
      setCandidates([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  }

  async function disable() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/weather-profile", { method: "DELETE" });
      if (!res.ok) throw new Error("Impossible de désactiver.");
      setProfile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  }

  if (profile) {
    return (
      <div className="space-y-2">
        <p className="text-sm">
          Actif pour <span className="font-medium">{profile.city}</span>.
        </p>
        <p className="text-muted text-sm">{multiplierLabel(profile.wateringIntervalMultiplier)}</p>
        {error && (
          <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={disable}
          disabled={saving}
          className="chip rounded-lg px-3 py-1.5 text-sm disabled:opacity-60"
        >
          Désactiver
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-muted text-sm">
        Ajuste automatiquement la fréquence d&apos;arrosage selon la météo de ta ville (données Open-Meteo, mises à jour
        une fois par jour).
      </p>
      <div className="relative">
        <input
          placeholder="Ta ville (ex. Bruxelles)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input w-full px-3 py-2 text-sm"
          disabled={saving}
        />
        {candidates.length > 0 && (
          <div className="card absolute left-0 right-0 z-10 mt-1 max-h-56 overflow-y-auto p-1">
            {candidates.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectCity(c)}
                disabled={saving}
                className="btn-ghost block w-full rounded-lg px-2 py-1.5 text-left text-sm disabled:opacity-60"
              >
                {[c.name, c.admin1, c.country].filter(Boolean).join(", ")}
              </button>
            ))}
          </div>
        )}
      </div>
      {searching && <p className="text-muted text-xs">Recherche...</p>}
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
