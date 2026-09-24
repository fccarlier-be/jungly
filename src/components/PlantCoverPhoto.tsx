"use client";

import Image from "next/image";
import { usePhotoViewer } from "./PhotoViewerProvider";
import { bypassesImageOptimizer } from "@/lib/imageOptimization";
import { PlantPlaceholder } from "@/components/art/paper";

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
      <PlantPlaceholder className="h-full w-full" />
    );
  }

  // La couverture peut etre une photo de la galerie (photos[]) ou l'image de
  // secours de la bibliotheque (pas dans la galerie) -- dans ce dernier cas
  // on ouvre la visionneuse sur elle seule.
  const allPhotos = photos.length > 0 ? photos : [displayUrl];
  const startIndex = Math.max(allPhotos.indexOf(displayUrl), 0);

  return (
    <button type="button" onClick={() => open(allPhotos, startIndex)} className="relative block h-full w-full">
      <Image
        src={displayUrl}
        alt=""
        fill
        sizes="(max-width: 640px) 100vw, 800px"
        className="object-cover"
        unoptimized={bypassesImageOptimizer(displayUrl)}
      />
    </button>
  );
}
