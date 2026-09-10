"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import PlantPhotoLightbox from "./PlantPhotoLightbox";

interface ViewerState {
  photos: string[];
  index: number;
}

const PhotoViewerContext = createContext<{ open: (photos: string[], index: number) => void } | null>(null);

/** A utiliser dans un descendant de PhotoViewerProvider pour ouvrir la visionneuse plein ecran. */
export function usePhotoViewer() {
  const ctx = useContext(PhotoViewerContext);
  if (!ctx) throw new Error("usePhotoViewer doit etre utilise a l'interieur de PhotoViewerProvider");
  return ctx;
}

/**
 * Partage l'etat de la visionneuse entre la photo de couverture (bandeau du
 * haut) et la galerie (plus bas sur la page) : deux composants distincts,
 * qui doivent pouvoir ouvrir la meme visionneuse plein ecran sur la meme
 * liste de photos.
 */
export default function PhotoViewerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ViewerState | null>(null);

  const open = useCallback((photos: string[], index: number) => {
    setState({ photos, index });
  }, []);

  return (
    <PhotoViewerContext.Provider value={{ open }}>
      {children}
      {state && <PlantPhotoLightbox photos={state.photos} initialIndex={state.index} onClose={() => setState(null)} />}
    </PhotoViewerContext.Provider>
  );
}
