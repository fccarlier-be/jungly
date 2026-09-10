"use client";

import { Sprout } from "lucide-react";
import { usePhotoViewer } from "./PhotoViewerProvider";

export default function PlantCoverPhoto({
  photos,
  coverUrl,
  fallbackImageUrl,
}: {
  photos: string[];
  coverUrl: string | null;
  fallbackImageUrl: string | null;
}) {
  const { open } = usePhotoViewer();
  const displayUrl = coverUrl || fallbackImageUrl;

  if (!displayUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center" style={{ color: "var(--secondary)" }}>
        <Sprout size={56} strokeWidth={1.5} />
      </div>
    );
  }

  // La couverture peut etre une photo de la galerie (photos[]) ou l'image de
  // secours de la bibliotheque (pas dans la galerie) -- dans ce dernier cas
  // on ouvre la visionneuse sur elle seule.
  const allPhotos = photos.length > 0 ? photos : [displayUrl];
  const startIndex = Math.max(allPhotos.indexOf(displayUrl), 0);

  return (
    <button type="button" onClick={() => open(allPhotos, startIndex)} className="block h-full w-full">
      <img src={displayUrl} alt="" className="h-full w-full object-cover" />
    </button>
  );
}
