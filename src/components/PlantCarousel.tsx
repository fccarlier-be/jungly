"use client";

import { useEffect, useRef, useState } from "react";
import PlantDetailView from "@/components/PlantDetailView";
import type { PlantDetailData } from "@/lib/plantDetailData";

const SWIPE_THRESHOLD_PX = 80;
const DIRECTION_LOCK_PX = 8;
const TRANSITION_MS = 220;

/**
 * Carrousel swipable entre TOUTES les fiches plantes de l'utilisateur,
 * toutes deja montees d'un coup (donnees completes recues du serveur, voir
 * getAllPlantDetails) -- naviguer d'une plante a l'autre ne recharge donc
 * jamais rien, ce n'est qu'un changement d'index anime.
 *
 * Boucle infinie sans "demi-tour" visuel : un clone de la derniere plante
 * est place avant la premiere et un clone de la premiere apres la
 * derniere. Franchir la fin anime normalement vers ce clone (meme sens que
 * le geste) puis, une fois la transition terminee, la position est
 * recalee instantanement (sans transition) sur la vraie plante -- invisible
 * puisque le clone lui est identique. `visualPosition` (0..n+1) pilote le
 * rendu ; `realIndex`, deduit par modulo, est la seule source de verite
 * pour l'URL et l'interactivite.
 *
 * L'URL est mise a jour via l'historique natif (pushState), pas le routeur
 * Next : tout le contenu est deja cote client, un `router.push` relancerait
 * un aller-retour serveur inutile et casserait la fluidite recherchee. Un
 * clic sur un vrai lien (Modifier, retour a la liste...) reste une
 * navigation Next normale, independante de ce composant.
 */
export default function PlantCarousel({ plants, initialId }: { plants: PlantDetailData[]; initialId: string }) {
  const n = plants.length;
  const hasSiblings = n > 1;
  const initialIndex = Math.max(
    plants.findIndex((p) => p.id === initialId),
    0,
  );

  const [visualPosition, setVisualPosition] = useState(initialIndex + 1);
  const [dragX, setDragX] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const outerRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x0: number; y0: number; dx: number; locked: "h" | "v" | null }>({
    x0: 0,
    y0: 0,
    dx: 0,
    locked: null,
  });

  const realIndex = (((visualPosition - 1) % n) + n) % n;

  useEffect(() => {
    const id = plants[realIndex]?.id;
    if (!id) return;
    const path = `/plantes/${id}`;
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
  }, [realIndex, plants]);

  useEffect(() => {
    function onPopState() {
      const match = window.location.pathname.match(/^\/plantes\/([^/]+)\/?$/);
      const id = match?.[1];
      if (!id) return;
      const idx = plants.findIndex((p) => p.id === id);
      if (idx >= 0) {
        setTransitioning(false);
        setDragX(0);
        setVisualPosition(idx + 1);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [plants]);

  useEffect(() => {
    const el = outerRef.current;
    if (!el || !hasSiblings) return;

    function onTouchStart(e: TouchEvent) {
      gesture.current = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, dx: 0, locked: null };
    }

    function onTouchMove(e: TouchEvent) {
      const g = gesture.current;
      const dx = e.touches[0].clientX - g.x0;
      const dy = e.touches[0].clientY - g.y0;

      if (g.locked === null) {
        if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return;
        g.locked = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
      if (g.locked !== "h") return;

      // Empeche le pull-to-refresh / rebond vertical du navigateur declenche
      // par la composante verticale inevitable d'un geste horizontal (voir
      // aussi overscroll-behavior-y: contain, globals.css).
      e.preventDefault();
      g.dx = dx;
      setDragX(dx);
    }

    function onTouchEnd() {
      const g = gesture.current;
      if (g.locked !== "h") return;
      const dx = g.dx;

      setTransitioning(true);
      setDragX(0);
      if (dx <= -SWIPE_THRESHOLD_PX) {
        setVisualPosition((v) => v + 1);
      } else if (dx >= SWIPE_THRESHOLD_PX) {
        setVisualPosition((v) => v - 1);
      }
      window.setTimeout(() => {
        setTransitioning(false);
        // Recale sur la vraie plante si on a atterri sur un clone
        // d'extremite -- meme contenu affiche, le saut est invisible.
        setVisualPosition((v) => (v === n + 1 ? 1 : v === 0 ? n : v));
      }, TRANSITION_MS);
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [hasSiblings, n]);

  if (!hasSiblings) return <PlantDetailView plant={plants[realIndex]} />;

  const slides = [
    { key: "clone-last", plant: plants[n - 1], interactive: false },
    ...plants.map((plant, i) => ({ key: plant.id, plant, interactive: i === realIndex })),
    { key: "clone-first", plant: plants[0], interactive: false },
  ];

  return (
    <div ref={outerRef} style={{ overflow: "hidden", touchAction: "pan-y" }}>
      <div
        style={{
          display: "flex",
          transform: `translateX(calc(${-visualPosition * 100}% + ${dragX}px))`,
          transition: transitioning ? `transform ${TRANSITION_MS}ms ease-out` : "none",
        }}
      >
        {slides.map((slide) => (
          <div key={slide.key} style={{ flex: "0 0 100%", minWidth: 0, pointerEvents: slide.interactive ? "auto" : "none" }}>
            <PlantDetailView plant={slide.plant} />
          </div>
        ))}
      </div>
    </div>
  );
}
