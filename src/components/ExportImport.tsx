"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function ExportImport() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setMessage(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.error ?? "Import impossible.");
      }
      setMessage(`${body.importedPlants} plante(s) importée(s).`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Fichier invalide.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <a href="/api/export" className="chip block w-full rounded-xl py-2.5 text-center text-sm font-medium">
        Télécharger mes données (JSON)
      </a>

      <div>
        <label className="btn-primary block cursor-pointer rounded-xl py-2.5 text-center text-sm font-semibold">
          {importing ? "Import en cours..." : "Importer une sauvegarde"}
          <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleImport} disabled={importing} />
        </label>
        <p className="text-xs text-muted mt-1">
          Les plantes importées sont toujours ajoutées (jamais fusionnées avec une plante existante).
        </p>
      </div>

      {message && <p className="text-sm text-muted">{message}</p>}
    </div>
  );
}
