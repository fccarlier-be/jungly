"use client";

import { useState } from "react";
import { Camera } from "lucide-react";

const ORGAN_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Automatique" },
  { value: "leaf", label: "Feuille" },
  { value: "flower", label: "Fleur" },
  { value: "fruit", label: "Fruit" },
  { value: "bark", label: "Écorce" },
];

interface LibraryEntryPreview {
  id: string;
  commonName: string;
  scientificName: string | null;
  careProfile: unknown;
}

export interface IdentifiedCandidate {
  scientificName: string;
  commonNames: string[];
  score: number;
  libraryEntry: LibraryEntryPreview | null;
  genusLibraryEntry: LibraryEntryPreview | null;
}

/**
 * Identification d'une plante par photo (Pl@ntNet, voir
 * src/server/plantnet/client.ts). Composant autonome, sur le meme principe
 * qu'ExternalSpeciesSearch.tsx : n'appelle l'API externe que sur action
 * explicite (choix d'un fichier), jamais automatiquement.
 *
 * Retour utilisateur (2026-09-20) : la photo servant a l'identification doit
 * aussi devenir la photo de la plante -- televersee en parallele de
 * l'appel Pl@ntNet (meme fichier, deux requetes independantes ; un File est
 * relisible plusieurs fois sans conflit) plutot que d'exiger une deuxieme
 * selection manuelle via "Choisir une photo".
 */
export default function PlantPhotoIdentify({
  onSelect,
  onPhotoUploaded,
}: {
  onSelect: (candidate: IdentifiedCandidate) => void;
  onPhotoUploaded: (url: string) => void;
}) {
  const [organ, setOrgan] = useState("auto");
  const [status, setStatus] = useState<"idle" | "loading" | "results" | "error">("idle");
  const [candidates, setCandidates] = useState<IdentifiedCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [appliedName, setAppliedName] = useState<string | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Permet de reselectionner le meme fichier si l'utilisateur reessaie.
    event.target.value = "";
    if (!file) return;
    setStatus("loading");
    setError(null);
    setAppliedName(null);

    // Televersement non bloquant : une panne d'upload n'empeche pas
    // l'identification de s'afficher (et inversement).
    const uploadFormData = new FormData();
    uploadFormData.append("file", file);
    fetch("/api/uploads", { method: "POST", body: uploadFormData })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (body?.url) onPhotoUploaded(body.url);
      })
      .catch(() => {});

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("organ", organ);
      const res = await fetch("/api/plants/identify", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Identification impossible.");
      setCandidates(body.results ?? []);
      setStatus("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
      setStatus("error");
    }
  }

  function select(candidate: IdentifiedCandidate) {
    onSelect(candidate);
    setAppliedName(candidate.scientificName);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={organ}
          onChange={(e) => setOrgan(e.target.value)}
          className="input px-2 py-2 text-sm"
          aria-label="Partie de la plante photographiée"
        >
          {ORGAN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="text-sm">
          <span className="chip inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2">
            <Camera size={14} />
            {status === "loading" ? "Identification..." : "Identifier via une photo"}
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFile}
            disabled={status === "loading"}
          />
        </label>
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {status === "results" && candidates.length === 0 && (
        <p className="text-muted text-sm">Aucune plante reconnue sur cette photo.</p>
      )}

      {status === "results" && candidates.length > 0 && (
        <div className="space-y-1.5">
          {candidates.map((c) => {
            const displayName = c.libraryEntry?.commonName ?? c.genusLibraryEntry?.commonName ?? c.commonNames[0];
            return (
              <button
                key={c.scientificName}
                type="button"
                onClick={() => select(c)}
                className="card flex w-full items-center justify-between gap-2 p-2.5 text-left text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium italic">{c.scientificName}</span>
                  {displayName && <span className="text-muted block">{displayName}</span>}
                </span>
                <span className="text-muted shrink-0 text-xs">{Math.round(c.score * 100)}%</span>
              </button>
            );
          })}
        </div>
      )}

      {appliedName && (
        <p className="text-xs" style={{ color: "var(--primary-strong)" }}>
          &quot;{appliedName}&quot; appliqué aux champs ci-dessous.
        </p>
      )}
    </div>
  );
}
