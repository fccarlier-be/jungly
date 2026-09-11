"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Star, Trash2, Plus } from "lucide-react";
import { usePhotoViewer } from "./PhotoViewerProvider";

export interface GalleryPhoto {
  id: string;
  url: string;
}

export default function PlantPhotoGallery({
  plantId,
  photos,
  coverUrl,
}: {
  plantId: string;
  photos: GalleryPhoto[];
  coverUrl: string | null;
}) {
  const router = useRouter();
  const { open: openViewer } = usePhotoViewer();
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Échec du téléversement.");
        const body = await res.json();
        urls.push(body.url);
      }
      const addRes = await fetch(`/api/plants/${plantId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      if (!addRes.ok) throw new Error("Impossible d'ajouter les photos.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setUploading(false);
    }
  }

  async function setCover(url: string) {
    setBusyId(url);
    setError(null);
    try {
      const res = await fetch(`/api/plants/${plantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl: url }),
      });
      if (!res.ok) throw new Error("Impossible de définir cette photo comme couverture.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(photoId: string) {
    if (!window.confirm("Supprimer cette photo ?")) return;
    setBusyId(photoId);
    setError(null);
    try {
      const res = await fetch(`/api/plants/${plantId}/photos/${photoId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Impossible de supprimer cette photo.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="animate-rise-in space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Photos</h2>
        <label className="text-sm">
          <span className="btn-primary inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold">
            <Plus size={14} />
            {uploading ? "Téléversement..." : "Ajouter"}
          </span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {photos.length === 0 ? (
        <p className="text-muted text-sm">Aucune photo pour l&apos;instant.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          {photos.map((photo) => {
            const isCover = photo.url === coverUrl;
            const busy = busyId === photo.id || busyId === photo.url;
            return (
              <div
                key={photo.id}
                className="relative aspect-square overflow-hidden rounded-xl"
                style={{ background: "var(--surface-alt)" }}
              >
                <button
                  type="button"
                  onClick={() => openViewer(photos.map((p) => p.url), photos.indexOf(photo))}
                  className="relative block h-full w-full"
                  aria-label="Agrandir cette photo"
                >
                  <Image
                    src={photo.url}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 33vw, 200px"
                    className="object-cover"
                    unoptimized={photo.url.startsWith("http")}
                  />
                </button>
                {isCover && (
                  <span
                    className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: "var(--surface)", color: "var(--primary-strong)" }}
                  >
                    <Star size={11} fill="currentColor" /> Couverture
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex gap-1 p-1.5">
                  {!isCover && (
                    <button
                      type="button"
                      onClick={() => setCover(photo.url)}
                      disabled={busy}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium backdrop-blur-sm disabled:opacity-60"
                      style={{ background: "var(--surface)", color: "var(--ink)" }}
                    >
                      <Star size={11} /> Couverture
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(photo.id)}
                    disabled={busy}
                    className="flex items-center justify-center rounded-lg p-1.5 backdrop-blur-sm disabled:opacity-60"
                    style={{ background: "var(--surface)", color: "var(--danger)" }}
                    aria-label="Supprimer cette photo"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
