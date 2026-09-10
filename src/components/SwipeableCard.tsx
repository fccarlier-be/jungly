"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Check, Clock } from "lucide-react";

const SWIPE_THRESHOLD_PX = 88;
const MAX_DRAG_PX = 140;

/**
 * Enveloppe une carte de tache pour la rendre "swipable" : glisser vers la
 * droite la reporte a demain, vers la gauche la valide comme faite. Les
 * boutons existants (Reporter/complet) restent disponibles a cote -- le
 * swipe est un raccourci, pas un remplacement.
 */
export default function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  disabled,
}: {
  children: ReactNode;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  disabled?: boolean;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef<number | null>(null);

  function onPointerDown(e: PointerEvent) {
    if (disabled) return;
    startX.current = e.clientX;
    setDragging(true);
  }

  function onPointerMove(e: PointerEvent) {
    if (startX.current == null) return;
    const delta = e.clientX - startX.current;
    setDragX(Math.max(-MAX_DRAG_PX, Math.min(MAX_DRAG_PX, delta)));
  }

  function endDrag() {
    if (startX.current == null) return;
    if (dragX > SWIPE_THRESHOLD_PX) onSwipeRight();
    else if (dragX < -SWIPE_THRESHOLD_PX) onSwipeLeft();
    setDragX(0);
    setDragging(false);
    startX.current = null;
  }

  const revealRight = dragX > 0; // glisse vers la droite -> revele "+1 jour" a gauche
  const progress = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD_PX, 1);

  return (
    <div className="relative overflow-hidden" style={{ borderRadius: "1.25rem" }}>
      {dragX !== 0 && (
        <div
          className="absolute inset-0 flex items-center"
          style={{
            borderRadius: "1.25rem",
            background: revealRight ? "var(--warning)" : "var(--primary)",
            justifyContent: revealRight ? "flex-start" : "flex-end",
            opacity: progress,
          }}
        >
          <div className="flex items-center gap-2 px-5 text-sm font-semibold" style={{ color: "#fff" }}>
            {revealRight ? (
              <>
                <Clock size={20} /> +1 jour
              </>
            ) : (
              <>
                Fait <Check size={20} />
              </>
            )}
          </div>
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => dragging && endDrag()}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? "none" : "transform 200ms ease",
          touchAction: "pan-y",
        }}
        className="relative"
      >
        {children}
      </div>
    </div>
  );
}
