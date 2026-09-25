"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Ban, Camera, Images, Loader2, X } from "@/components/icons";
import { bypassesImageOptimizer } from "@/lib/imageOptimization";
import {
  CUTTING_LISTING_TYPES,
  CUTTING_LISTING_TYPE_LABEL,
  CUTTINGS_NO_SALE_RULE,
  MAX_CUTTING_PHOTOS,
  MAX_CUTTING_QUANTITY,
  type CuttingListingType,
} from "@/server/cuttings/types";

export default function CuttingListingForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [species, setSpecies] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<CuttingListingType>("DON");
  const [quantity, setQuantity] = useState(1);
  const [noSaleAccepted, setNoSaleAccepted] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePhotoFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Téléversement impossible.");
      const data = await res.json();
      setPhotoUrls((prev) => [...prev, data.url]);
    } catch {
      setError("Impossible de téléverser la photo.");
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(url: string) {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (photoUrls.length === 0) {
      setError("Au moins une photo est obligatoire.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cuttings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          species: species || undefined,
          description: description || undefined,
          type,
          quantity,
          photoUrls,
          noSaleAccepted,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Erreurs de validation (dont le refus d'un prix dans le texte) : le
        // message utile est dans details, pas dans le "Donnees invalides." generique.
        const fieldMessage = Object.values((body.details?.fieldErrors ?? {}) as Record<string, string[]>).flat()[0];
        throw new Error(fieldMessage ?? body.error ?? "Impossible de publier l'annonce.");
      }
      router.push(`/boutures/${body.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <p className="flex gap-2 rounded-lg p-3 text-sm" style={{ background: "color-mix(in srgb, var(--warning) 14%, transparent)" }}>
        <Ban size={18} className="mt-0.5 shrink-0" style={{ color: "var(--warning)" }} aria-hidden />
        <span>{CUTTINGS_NO_SALE_RULE}</span>
      </p>

      <div className="flex gap-2">
        {CUTTING_LISTING_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`chip rounded-full px-4 py-1.5 text-sm ${type === t ? "chip-active" : ""}`}
          >
            {CUTTING_LISTING_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="cutting-title" className="text-muted mb-1 block text-xs font-medium uppercase tracking-wide">
          Titre
        </label>
        <input
          id="cutting-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={120}
          placeholder="Ex. Bouture de Pothos doré"
          className="input w-full"
        />
      </div>

      <div>
        <label htmlFor="cutting-quantity" className="text-muted mb-1 block text-xs font-medium uppercase tracking-wide">
          Nombre de boutures proposées
        </label>
        <input
          id="cutting-quantity"
          type="number"
          min={1}
          max={MAX_CUTTING_QUANTITY}
          value={quantity}
          onChange={(e) => setQuantity(Math.min(MAX_CUTTING_QUANTITY, Math.max(1, Number(e.target.value) || 1)))}
          className="input w-24"
        />
        <p className="text-muted mt-1 text-xs">Tu pourras les répartir entre plusieurs personnes, un échange à la fois.</p>
      </div>

      <div>
        <label htmlFor="cutting-species" className="text-muted mb-1 block text-xs font-medium uppercase tracking-wide">
          Espèce (optionnel)
        </label>
        <input id="cutting-species" value={species} onChange={(e) => setSpecies(e.target.value)} maxLength={200} className="input w-full" />
      </div>

      <div>
        <label htmlFor="cutting-description" className="text-muted mb-1 block text-xs font-medium uppercase tracking-wide">
          Description (optionnel)
        </label>
        <textarea
          id="cutting-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={4}
          className="input w-full"
        />
      </div>

      <div>
        <p className="text-muted mb-1.5 text-xs font-medium uppercase tracking-wide">Photo(s) — au moins une obligatoire</p>
        <div className="flex flex-wrap gap-2">
          {photoUrls.map((url) => (
            <div key={url} className="relative h-20 w-20 overflow-hidden rounded-lg" style={{ background: "var(--surface-alt)" }}>
              <Image src={url} alt="" fill sizes="80px" className="object-cover" unoptimized={bypassesImageOptimizer(url)} />
              <button
                type="button"
                onClick={() => removePhoto(url)}
                aria-label="Retirer cette photo"
                className="absolute right-1 top-1 rounded-full p-0.5 text-white"
                style={{ background: "rgba(0, 0, 0, 0.55)" }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {/* Deux tuiles plutot qu'un input unique : capture="environment"
              force l'appareil photo, sans lui Android ouvre la galerie seule
              -- un seul input ne peut pas offrir les deux de facon fiable
              (meme choix que PlantPhotoGallery/PlantForm ; retour
              utilisateur, 2026-09-25 : seule la camera etait proposee ici). */}
          {photoUrls.length < MAX_CUTTING_PHOTOS && (
            <>
              <label>
                <span className="chip flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg text-xs">
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                  Photo
                </span>
                <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploading} onChange={handlePhotoFile} />
              </label>
              <label>
                <span className="chip flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg text-xs">
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Images size={16} />}
                  Galerie
                </span>
                <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={handlePhotoFile} />
              </label>
            </>
          )}
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={noSaleAccepted} onChange={(e) => setNoSaleAccepted(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>Je m&apos;engage à donner ou échanger ces boutures, sans jamais demander d&apos;argent.</span>
      </label>

      <button
        type="submit"
        disabled={submitting || uploading || !title.trim() || photoUrls.length === 0 || !noSaleAccepted}
        className="btn-primary w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {submitting ? "Publication..." : "Publier l'annonce"}
      </button>
    </form>
  );
}
