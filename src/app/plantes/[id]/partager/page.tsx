import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionUserId } from "@/lib/session";
import { NotFoundError } from "@/lib/errors";
import { formatDate } from "@/lib/units";
import { loadSharePlant } from "@/server/shareCard/data";
import PlantShareFlow from "@/components/PlantShareFlow";

export default async function PlantSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireSessionUserId();

  let plant;
  try {
    plant = await loadSharePlant(userId, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/plantes/${plant.id}`} className="text-sm font-medium" style={{ color: "var(--primary-strong)" }}>
          ← Retour à {plant.name}
        </Link>
      </div>
      <h1 className="font-display text-2xl font-semibold">Partager {plant.name}</h1>
      <PlantShareFlow
        plant={{
          id: plant.id,
          name: plant.name,
          scientificName: plant.scientificName,
          coverUrl: plant.coverUrl,
          since: plant.since.toISOString(),
          waterings: plant.waterings,
          fertilizings: plant.fertilizings,
          healthLevel: plant.healthLevel,
          photos: plant.photos.map((p) => ({ id: p.id, url: p.url, createdAt: p.createdAt.toISOString(), dateLabel: formatDate(p.createdAt) })),
        }}
      />
    </div>
  );
}
