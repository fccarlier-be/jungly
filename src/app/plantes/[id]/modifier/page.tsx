import { notFound } from "next/navigation";
import { requireSessionUserId } from "@/lib/session";
import { db } from "@/server/db";
import PlantForm from "@/components/PlantForm";
import CareRulesManager from "@/components/CareRulesManager";
import DeletePlantButton from "@/components/DeletePlantButton";

export default async function EditPlantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireSessionUserId();

  const plant = await db.plant.findFirst({
    where: { id, userId },
    include: { careRules: { orderBy: { createdAt: "asc" } } },
  });
  if (!plant) notFound();

  const [locations, fertilizers] = await Promise.all([
    db.location.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    db.fertilizer.findMany({ where: { userId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">Modifier {plant.name}</h1>

      <PlantForm mode="edit" initial={plant} locations={locations} fertilizers={fertilizers} />

      <section className="space-y-2">
        <h2 className="font-semibold">Règles d&apos;entretien</h2>
        <CareRulesManager plantId={plant.id} rules={plant.careRules} fertilizers={fertilizers} />
      </section>

      <section>
        <DeletePlantButton plantId={plant.id} plantName={plant.name} />
      </section>
    </div>
  );
}
