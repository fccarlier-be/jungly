"use client";

import { useEffect, useState, type TouchEvent } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

const SWIPE_THRESHOLD_PX = 40;

export default function PlantPhotoLightbox({
  photos,
  initialIndex,
  onClose,
}: {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, photos.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      html.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [photos.length, onClose]);

  function onTouchStart(e: TouchEvent) {
    setTouchStartX(e.touches[0].clientX);
  }

  function onTouchEnd(e: TouchEvent) {
    if (touchStartX == null) return;
    const delta = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(delta) > SWIPE_THRESHOLD_PX) {
      setIndex((i) => (delta < 0 ? Math.min(i + 1, photos.length - 1) : Math.max(i - 1, 0)));
    }
    setTouchStartX(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "rgba(0, 0, 0, 0.95)" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-center justify-between p-4 text-white">
        <span className="text-sm">
          {index + 1} / {photos.length}
        </span>
        <button type="button" onClick={onClose} aria-label="Fermer" className="p-1">
          <X size={22} />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-2 pb-4">
        {index > 0 && (
          <button
            type="button"
            onClick={() => setIndex((i) => i - 1)}
            aria-label="Photo précédente"
            className="absolute left-2 z-10 rounded-full p-2 text-white"
            style={{ background: "rgba(0, 0, 0, 0.4)" }}
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <Image
          src={photos[index]}
          alt=""
          fill
          sizes="100vw"
          className="object-contain"
          unoptimized={photos[index].startsWith("http")}
        />
        {index < photos.length - 1 && (
          <button
            type="button"
            onClick={() => setIndex((i) => i + 1)}
            aria-label="Photo suivante"
            className="absolute right-2 z-10 rounded-full p-2 text-white"
            style={{ background: "rgba(0, 0, 0, 0.4)" }}
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>
    </div>
  );
}
