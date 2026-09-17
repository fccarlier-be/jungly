import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionUserId } from "@/lib/session";
import { db } from "@/server/db";
import ContainerDiagram from "@/components/ContainerDiagram";

export default async function ContainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireSessionUserId();

  const container = await db.container.findFirst({
    where: { id, userId },
    include: { plants: { orderBy: { name: "asc" } } },
  });
  if (!container) notFound();

  const unassignedPlants = await db.plant.findMany({
    where: { userId, containerId: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">{container.name}</h1>
        <Link href="/jardinieres" className="text-sm font-medium" style={{ color: "var(--primary-strong)" }}>
          Mes jardinières
        </Link>
      </div>
      <p className="text-muted text-sm">
        Glissez une plante pour la repositionner, ou ajoutez-en une depuis la liste des plantes disponibles.
      </p>
      <ContainerDiagram
        containerId={container.id}
        shape={container.potShape}
        lengthMm={container.potLengthMm}
        widthMm={container.potWidthMm}
        plants={container.plants
          .filter((p) => p.positionX != null && p.positionY != null)
          .map((p) => ({ id: p.id, name: p.name, positionX: p.positionX!, positionY: p.positionY! }))}
        unassignedPlants={unassignedPlants}
      />
    </div>
  );
}
