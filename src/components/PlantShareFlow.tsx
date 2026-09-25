"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Loader2, Share } from "@/components/icons";
import { bypassesImageOptimizer } from "@/lib/imageOptimization";
import { buildDefaultShareText, FORMAT_LABEL, SHARE_FORMATS, type ShareFormat, type ShareMode } from "@/lib/shareCard";
import type { HealthLevel } from "@/lib/plantHealth";

interface SharePhotoView {
  id: string;
  url: string;
  createdAt: string;
  dateLabel: string;
}

export interface PlantShareData {
  id: string;
  name: string;
  scientificName: string | null;
  coverUrl: string | null;
  since: string;
  waterings: number;
  fertilizings: number;
  healthLevel: HealthLevel | null;
  // De la plus ancienne a la plus recente.
  photos: SharePhotoView[];
}

interface RenderedCard {
  format: ShareFormat;
  blob: Blob;
  objectUrl: string;
}

function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "plante"
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Page de partage : choix du mode (carte simple ou avant/apres), du ou des
 * formats et des photos, apercu des cartes, texte d'accompagnement
 * modifiable, puis envoi par le menu de partage natif (Web Share API avec
 * fichiers : WhatsApp, Messenger, Facebook, Instagram...). Sans cette API
 * (la plupart des navigateurs de bureau) : telechargement + copie du texte.
 *
 * Les cartes sont telechargees des l'apercu et gardees en memoire :
 * navigator.share() doit etre appele pendant le geste de l'utilisateur, un
 * fetch intercale au moment du clic (rendu de plusieurs centaines de ms)
 * ferait refuser le partage par certains navigateurs.
 */
export default function PlantShareFlow({ plant }: { plant: PlantShareData }) {
  const photos = plant.photos;
  const canBeforeAfter = photos.length >= 2;
  const coverPhoto = photos.find((p) => p.url === plant.coverUrl);

  const [mode, setMode] = useState<ShareMode>("single");
  const [formats, setFormats] = useState<ShareFormat[]>(["square"]);
  const [photoId, setPhotoId] = useState<string | null>(coverPhoto?.id ?? photos.at(-1)?.id ?? null);
  const [beforeId, setBeforeId] = useState<string | null>(photos[0]?.id ?? null);
  const [afterId, setAfterId] = useState<string | null>(photos.at(-1)?.id ?? null);

  // Dernier rendu recu, etiquete par les parametres qui l'ont produit : le
  // chargement se deduit de l'ecart entre ces parametres et ceux demandes,
  // sans setState synchrone dans l'effet.
  const [result, setResult] = useState<{ key: string; cards: RenderedCard[]; error: string | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const before = photos.find((p) => p.id === beforeId);
  const after = photos.find((p) => p.id === afterId);
  const sameBeforeAfter = mode === "beforeAfter" && beforeId === afterId;

  const defaultText = useMemo(() => {
    // Ordre chronologique, comme sur la carte (la route trie aussi).
    const dates = [before, after].filter(Boolean).map((p) => new Date(p!.createdAt)).sort((a, b) => a.getTime() - b.getTime());
    return buildDefaultShareText({
      name: plant.name,
      scientificName: plant.scientificName,
      since: new Date(plant.since),
      waterings: plant.waterings,
      fertilizings: plant.fertilizings,
      healthLevel: plant.healthLevel,
      mode,
      beforeDate: dates[0],
      afterDate: dates[1],
    });
  }, [plant, mode, before, after]);
  // null tant que l'utilisateur n'a pas touche au texte : il suit alors les
  // options choisies ; une fois modifie, il n'est plus jamais ecrase.
  const [editedText, setEditedText] = useState<string | null>(null);
  const text = editedText ?? defaultText;

  const query = useMemo(() => {
    if (mode === "single") return photoId ? `mode=single&photo=${encodeURIComponent(photoId)}` : "mode=single";
    if (!beforeId || !afterId || beforeId === afterId) return null;
    return `mode=beforeAfter&before=${encodeURIComponent(beforeId)}&after=${encodeURIComponent(afterId)}`;
  }, [mode, photoId, beforeId, afterId]);

  const requestKey = query ? `${formats.join(",")}|${query}` : null;

  useEffect(() => {
    if (!requestKey || !query) return;
    const controller = new AbortController();
    Promise.all(
      formats.map(async (format) => {
        const res = await fetch(`/api/plants/${plant.id}/share-card?format=${format}&${query}`, { signal: controller.signal });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Impossible de générer la carte.");
        }
        const blob = await res.blob();
        return { format, blob, objectUrl: URL.createObjectURL(blob) };
      }),
    )
      .then((cards) => {
        if (controller.signal.aborted) {
          for (const card of cards) URL.revokeObjectURL(card.objectUrl);
          return;
        }
        setResult({ key: requestKey, cards, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, cards: [], error: err instanceof Error ? err.message : "Impossible de générer la carte." });
      });
    return () => controller.abort();
  }, [plant.id, query, formats, requestKey]);

  // Libere les images d'un rendu des qu'il est remplace (ou au demontage).
  useEffect(() => {
    return () => {
      for (const card of result?.cards ?? []) URL.revokeObjectURL(card.objectUrl);
    };
  }, [result]);

  const upToDate = result !== null && result.key === requestKey;
  const loading = requestKey !== null && !upToDate;
  // Pendant un nouveau rendu, l'ancien apercu reste affiche (grise) plutot
  // que de faire sauter la page ; le partage, lui, attend le rendu a jour.
  const cards = requestKey ? (result?.cards ?? []) : [];
  const error = upToDate ? result.error : null;

  function toggleFormat(format: ShareFormat) {
    setFormats((current) => {
      if (current.includes(format)) return current.length === 1 ? current : current.filter((f) => f !== format);
      // Ordre stable (carre puis story) quel que soit l'ordre des clics.
      return SHARE_FORMATS.filter((f) => f === format || current.includes(f));
    });
  }

  function files(): File[] {
    const slug = slugify(plant.name);
    const suffix = mode === "beforeAfter" ? "-avant-apres" : "";
    return cards.map((c) => new File([c.blob], `jungly-${slug}${suffix}-${c.format === "square" ? "carre" : "story"}.png`, { type: "image/png" }));
  }

  async function copyText(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function share() {
    setNotice(null);
    const toShare = files();
    if (toShare.length === 0) return;
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: toShare })) {
      try {
        await navigator.share({ files: toShare, text });
      } catch (err) {
        // Fermeture du menu de partage par l'utilisateur : pas une erreur.
        if (err instanceof Error && err.name === "AbortError") return;
        setNotice("Le partage a échoué. Tu peux télécharger l'image et copier le texte à la place.");
      }
      return;
    }
    // Pas de partage de fichiers (navigateur de bureau le plus souvent).
    toShare.forEach((f) => downloadBlob(f, f.name));
    const copied = await copyText();
    setNotice(
      copied
        ? "Ton navigateur ne permet pas le partage direct : image téléchargée et texte copié, il ne reste qu'à les coller dans l'appli de ton choix."
        : "Ton navigateur ne permet pas le partage direct : image téléchargée.",
    );
  }

  async function onCopy() {
    setNotice((await copyText()) ? "Texte copié." : "Impossible de copier le texte.");
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Type de carte</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode("single")} className={`chip rounded-full px-3.5 py-1.5 text-sm ${mode === "single" ? "chip-active" : ""}`}>
            Carte
          </button>
          <button
            type="button"
            onClick={() => setMode("beforeAfter")}
            disabled={!canBeforeAfter}
            className={`chip rounded-full px-3.5 py-1.5 text-sm disabled:opacity-50 ${mode === "beforeAfter" ? "chip-active" : ""}`}
          >
            Avant / après
          </button>
        </div>
        {!canBeforeAfter && <p className="text-muted text-xs">Ajoute au moins deux photos à la galerie de la plante pour créer un avant / après.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Format</h2>
        <div className="flex gap-2">
          {SHARE_FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              aria-pressed={formats.includes(format)}
              onClick={() => toggleFormat(format)}
              className={`chip rounded-full px-3.5 py-1.5 text-sm ${formats.includes(format) ? "chip-active" : ""}`}
            >
              {FORMAT_LABEL[format]}
            </button>
          ))}
        </div>
        <p className="text-muted text-xs">Carré pour les publications et WhatsApp, story pour les stories Instagram / Facebook. Tu peux choisir les deux.</p>
      </section>

      {mode === "single" ? (
        photos.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Photo</h2>
            <PhotoPicker photos={photos} selected={photoId} onSelect={setPhotoId} />
          </section>
        )
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Avant</h2>
            <PhotoPicker photos={photos} selected={beforeId} onSelect={setBeforeId} />
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Après</h2>
            <PhotoPicker photos={photos} selected={afterId} onSelect={setAfterId} />
          </section>
          {sameBeforeAfter && <p className="text-sm" style={{ color: "var(--danger)" }}>Choisis deux photos différentes.</p>}
        </>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Aperçu</h2>
        {error && (
          <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        <div className="flex items-start gap-3">
          {loading && cards.length === 0 && (
            <div className="card text-muted flex aspect-square w-full max-w-xs items-center justify-center gap-2 text-sm">
              <Loader2 size={18} className="animate-spin" /> Création de la carte…
            </div>
          )}
          {cards.map((card) => (
            // Blob local : ni next/image (pas d'URL distante) ni optimisation utile.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={card.format}
              src={card.objectUrl}
              alt={`Carte ${FORMAT_LABEL[card.format].toLowerCase()} de ${plant.name}`}
              className="card min-w-0 p-0"
              style={{ width: card.format === "square" ? "min(100%, 20rem)" : "min(56%, 11.25rem)", opacity: loading ? 0.5 : 1 }}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Texte</h2>
        <textarea value={text} onChange={(e) => setEditedText(e.target.value)} rows={4} maxLength={1000} className="input w-full px-3 py-2 text-sm" />
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted text-xs">Instagram n&apos;utilise pas ce texte : copie-le pour le coller en légende.</p>
          {editedText !== null && (
            <button type="button" onClick={() => setEditedText(null)} className="text-xs font-medium whitespace-nowrap" style={{ color: "var(--primary-strong)" }}>
              Texte d&apos;origine
            </button>
          )}
        </div>
      </section>

      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={share}
          disabled={!upToDate || cards.length === 0}
          className="btn-primary col-span-2 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          <Share size={16} /> Partager
        </button>
        <button type="button" onClick={onCopy} className="btn-ghost rounded-lg py-2 text-sm font-medium">
          Copier le texte
        </button>
        <button
          type="button"
          onClick={() => files().forEach((f) => downloadBlob(f, f.name))}
          disabled={!upToDate || cards.length === 0}
          className="btn-ghost rounded-lg py-2 text-sm font-medium disabled:opacity-60"
        >
          Télécharger
        </button>
      </div>
    </div>
  );
}

function PhotoPicker({ photos, selected, onSelect }: { photos: SharePhotoView[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {photos.map((photo) => {
        const active = photo.id === selected;
        return (
          <button
            key={photo.id}
            type="button"
            onClick={() => onSelect(photo.id)}
            aria-pressed={active}
            className="shrink-0 text-center"
            style={{ width: 72 }}
          >
            <span
              className="relative block h-[72px] w-[72px] overflow-hidden rounded-xl"
              style={{ background: "var(--surface-alt)" }}
            >
              <Image src={photo.url} alt="" fill sizes="72px" className="object-cover" unoptimized={bypassesImageOptimizer(photo.url)} />
              {/* Bordure interieure, par-dessus la photo : un contour exterieur
                  serait rogne par le defilement horizontal (meme piege que la
                  pastille de l'accueil, 2026-09-25). */}
              {active && <span className="absolute inset-0 rounded-xl" style={{ boxShadow: "inset 0 0 0 3px var(--primary)" }} />}
            </span>
            <span className="text-muted mt-0.5 block truncate text-[11px]">{photo.dateLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
