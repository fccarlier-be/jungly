"use client";

import { useState } from "react";
import { Search, Sprout, ExternalLink } from "lucide-react";

type ExternalSource = "OPENPLANTBOOK" | "PERENUAL";

const SOURCE_LABEL: Record<ExternalSource, string> = { OPENPLANTBOOK: "OpenPlantbook", PERENUAL: "Perenual" };

interface ExternalPreviewItem {
  source: ExternalSource;
  sourceId: string;
  commonName: string;
  scientificName: string | null;
  family: string | null;
  thumbnailUrl: string | null;
}

interface ExternalDetailsPreview {
  source: ExternalSource;
  sourceId: string;
  commonName: string;
  scientificName: string | null;
  family: string | null;
  careProfile: {
    exposure?: string;
    humidity?: string;
    toxicity?: string;
    tips?: string;
    imageUrl?: string;
    careLevel?: string;
    watering?: { recurrenceType: string; interval: number };
  };
  image: { imageUrl: string | null; imageLicense: string | null; imageLicenseUrl: string | null };
  alreadyImported: boolean;
  completedFrom?: ExternalSource;
}

export interface ImportedLibraryEntry {
  id: string;
  commonName: string;
  scientificName: string | null;
  family: string | null;
  careProfile: unknown;
}

/**
 * Recherche externe (OpenPlantbook puis Perenual en repli), previsualisation
 * puis import dans la bibliotheque locale. N'appelle l'API externe que sur
 * clic explicite (jamais au fil de la frappe) -- la recherche locale reste
 * l'etape instantanee par defaut.
 */
export default function ExternalSpeciesSearch({
  query,
  onImported,
}: {
  query: string;
  onImported?: (entry: ImportedLibraryEntry) => void;
}) {
  const [status, setStatus] = useState<"idle" | "searching" | "results" | "error">("idle");
  const [results, setResults] = useState<ExternalPreviewItem[]>([]);
  const [resultsSource, setResultsSource] = useState<ExternalSource | null>(null);
  const [preview, setPreview] = useState<ExternalDetailsPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setStatus("searching");
    setError(null);
    setPreview(null);
    setImported(false);
    try {
      const res = await fetch(`/api/library/external?q=${encodeURIComponent(query)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Recherche en ligne impossible.");
      setResults(body.results ?? []);
      setResultsSource(body.source ?? null);
      setStatus("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
      setStatus("error");
    }
  }

  async function openPreview(item: ExternalPreviewItem) {
    setPreviewLoading(true);
    setError(null);
    setImported(false);
    try {
      const res = await fetch(`/api/library/external/${encodeURIComponent(item.sourceId)}?source=${item.source}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Aperçu indisponible.");
      setPreview(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/library/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: preview.source, sourceId: preview.sourceId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Import impossible.");
      setImported(true);
      onImported?.(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setImporting(false);
    }
  }

  if (query.trim().length < 2) return null;

  return (
    <div className="space-y-2">
      {status === "idle" && (
        <button onClick={search} className="chip flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm">
          <Search size={14} />
          Rechercher &quot;{query}&quot; en ligne
        </button>
      )}

      {status === "searching" && <p className="text-muted py-2 text-center text-sm">Recherche en cours...</p>}

      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

      {status === "results" && !preview && (
        <div className="space-y-1.5">
          {results.length === 0 && <p className="text-muted text-sm">Aucun résultat en ligne pour &quot;{query}&quot;.</p>}
          {results.length > 0 && resultsSource && (
            <p className="text-muted text-xs">Résultats {SOURCE_LABEL[resultsSource]}</p>
          )}
          {results.map((r) => (
            <button
              key={`${r.source}-${r.sourceId}`}
              onClick={() => openPreview(r)}
              disabled={previewLoading}
              className="card flex w-full items-center gap-3 p-2.5 text-left text-sm"
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg"
                style={{ background: "var(--surface-alt)", color: "var(--secondary)" }}
              >
                {r.thumbnailUrl ? (
                  <img src={r.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Sprout size={18} strokeWidth={1.5} />
                )}
              </div>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{r.commonName}</span>
                {r.scientificName && <span className="text-muted block italic">{r.scientificName}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {preview && (
        <div className="card space-y-2 p-3 text-sm">
          {preview.image.imageUrl && (
            <img src={preview.image.imageUrl} alt="" className="h-32 w-full rounded-lg object-cover" />
          )}
          <div>
            <p className="font-medium">{preview.commonName}</p>
            {preview.scientificName && <p className="text-muted italic">{preview.scientificName}</p>}
          </div>
          {preview.careProfile.exposure && <p className="text-muted">Exposition : {preview.careProfile.exposure}</p>}
          {preview.careProfile.watering && (
            <p className="text-muted">
              Arrosage : tous les {preview.careProfile.watering.interval} jours (estimation
              {preview.completedFrom ? `, via ${SOURCE_LABEL[preview.completedFrom]}` : ""})
            </p>
          )}
          {preview.careProfile.toxicity && <p className="text-muted">Toxicité : {preview.careProfile.toxicity}</p>}
          {preview.careProfile.careLevel && <p className="text-muted">Niveau d&apos;entretien : {preview.careProfile.careLevel}</p>}
          <p className="text-muted flex items-center gap-1 text-xs">
            Source : {SOURCE_LABEL[preview.source]}
            {preview.image.imageLicense && (
              <>
                {" · Photo : "}
                {preview.image.imageLicenseUrl ? (
                  <a href={preview.image.imageLicenseUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
                    {preview.image.imageLicense}
                    <ExternalLink size={10} />
                  </a>
                ) : (
                  preview.image.imageLicense
                )}
              </>
            )}
          </p>
          {preview.alreadyImported && !imported && (
            <p className="text-xs" style={{ color: "var(--primary-strong)" }}>Déjà présente dans ta bibliothèque.</p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={confirmImport}
              disabled={importing || imported}
              className="btn-primary flex-1 rounded-xl py-2 text-sm font-semibold disabled:opacity-60"
            >
              {imported ? "Ajoutée ✓" : importing ? "Import..." : preview.alreadyImported ? "Mettre à jour ma bibliothèque" : "Ajouter à ma bibliothèque"}
            </button>
            <button onClick={() => setPreview(null)} className="chip rounded-xl px-3 py-2 text-sm">
              Retour
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
