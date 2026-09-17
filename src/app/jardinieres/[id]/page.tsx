import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionUserId } from "@/lib/session";
import { db } from "@/server/db";
import { normalizeWateringIntervalDays, checkContainerCompatibility } from "@/lib/containerCompatibility";
import ContainerDiagram from "@/components/ContainerDiagram";

const PLANT_COMPAT_SELECT = {
  id: true,
  name: true,
  substrateType: true,
  careRules: { where: { type: "WATERING" as const, enabled: true }, take: 1 },
};

export default async function ContainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireSessionUserId();

  const container = await db.container.findFirst({
    where: { id, userId },
    include: {
      plants: {
        orderBy: { name: "asc" },
        select: { ...PLANT_COMPAT_SELECT, positionX: true, positionY: true },
      },
    },
  });
  if (!container) notFound();

  const unassignedPlants = await db.plant.findMany({
    where: { userId, containerId: null },
    orderBy: { name: "asc" },
    select: PLANT_COMPAT_SELECT,
  });

  const occupants = container.plants.map((p) => ({
    id: p.id,
    name: p.name,
    substrateType: p.substrateType,
    wateringIntervalDays: normalizeWateringIntervalDays(p.careRules[0]),
  }));
  // Bandeau permanent : recalcule a chaque affichage a partir des occupants
  // actuels, couvre aussi les jardinieres composees avant cette fonctionnalite.
  const warnings = checkContainerCompatibility(occupants);

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
      {warnings.length > 0 && (
        <div
          className="space-y-1 rounded-lg px-3 py-2 text-sm"
          style={{ background: "color-mix(in srgb, var(--warning) 15%, var(--surface))", color: "var(--warning)" }}
        >
          {warnings.map((w) => (
            <p key={w.kind}>⚠ {w.message}</p>
          ))}
        </div>
      )}
      <ContainerDiagram
        containerId={container.id}
        shape={container.potShape}
        lengthMm={container.potLengthMm}
        widthMm={container.potWidthMm}
        plants={container.plants
          .filter((p) => p.positionX != null && p.positionY != null)
          .map((p) => ({
            id: p.id,
            name: p.name,
            positionX: p.positionX!,
            positionY: p.positionY!,
            substrateType: p.substrateType,
            wateringIntervalDays: normalizeWateringIntervalDays(p.careRules[0]),
          }))}
        unassignedPlants={unassignedPlants.map((p) => ({
          id: p.id,
          name: p.name,
          substrateType: p.substrateType,
          wateringIntervalDays: normalizeWateringIntervalDays(p.careRules[0]),
        }))}
      />
    </div>
  );
}
