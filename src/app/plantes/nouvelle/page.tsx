import { requireSessionUserId } from "@/lib/session";
import { db } from "@/server/db";
import PlantForm from "@/components/PlantForm";

export default async function NewPlantPage() {
  const userId = await requireSessionUserId();

  const [locations, fertilizers] = await Promise.all([
    db.location.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    db.fertilizer.findMany({ where: { userId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">Ajouter une plante</h1>
      <PlantForm mode="create" locations={locations} fertilizers={fertilizers} />
    </div>
  );
}
