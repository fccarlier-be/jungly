import { notFound } from "next/navigation";
import { requireSessionUserId } from "@/lib/session";
import PhotoViewerProvider from "@/components/PhotoViewerProvider";
import PlantCarousel from "@/components/PlantCarousel";
import { getAllPlantDetails } from "@/lib/plantDetailData";

export default async function PlantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireSessionUserId();

  const plants = await getAllPlantDetails(userId);
  if (!plants.some((p) => p.id === id)) notFound();

  return (
    <PhotoViewerProvider>
      <PlantCarousel plants={plants} initialId={id} />
    </PhotoViewerProvider>
  );
}
