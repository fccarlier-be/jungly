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
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/import", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.error ?? "Import impossible.");
      }
      const sensorNote =
        body.sensorApiKeys?.length > 0
          ? ` ${body.sensorApiKeys.length} capteur(s) importé(s) avec une nouvelle clé -- voir la fiche de chaque plante pour la reconfigurer sur l'appareil.`
          : "";
      setMessage(`${body.importedPlants} plante(s) importée(s).${sensorNote}`);
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
        Télécharger mes données (.zip)
      </a>

      <div>
        <label className="btn-primary block cursor-pointer rounded-xl py-2.5 text-center text-sm font-semibold">
          {importing ? "Import en cours..." : "Importer une sauvegarde"}
          <input ref={fileInputRef} type="file" accept=".zip,application/zip" className="hidden" onChange={handleImport} disabled={importing} />
        </label>
        <p className="text-xs text-muted mt-1">
          Les plantes importées sont toujours ajoutées (jamais fusionnées avec une plante existante). Les photos sont restaurées avec l&apos;archive.
        </p>
      </div>

      {message && <p className="text-sm text-muted">{message}</p>}
    </div>
  );
}
