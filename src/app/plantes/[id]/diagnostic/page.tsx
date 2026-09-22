import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionUserId } from "@/lib/session";
import { db } from "@/server/db";
import PlantDiagnosisFlow from "@/components/PlantDiagnosisFlow";

export default async function PlantDiagnosisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireSessionUserId();

  const plant = await db.plant.findFirst({ where: { id, userId }, select: { id: true, name: true } });
  if (!plant) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/plantes/${plant.id}`} className="text-sm font-medium" style={{ color: "var(--primary-strong)" }}>
          ← Retour à {plant.name}
        </Link>
      </div>
      <h1 className="font-display text-2xl font-semibold">Diagnostiquer {plant.name}</h1>
      <PlantDiagnosisFlow plantId={plant.id} />
    </div>
  );
}
