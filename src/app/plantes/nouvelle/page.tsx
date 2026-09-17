import { requireSessionUserId } from "@/lib/session";
import { db } from "@/server/db";
import { listContainerOptionsForUser } from "@/server/containerAssignment";
import PlantForm from "@/components/PlantForm";

export default async function NewPlantPage() {
  const userId = await requireSessionUserId();

  const [locations, containers, fertilizers, user] = await Promise.all([
    db.location.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    listContainerOptionsForUser(userId),
    db.fertilizer.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { unitSystem: true } }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">Ajouter une plante</h1>
      <PlantForm mode="create" locations={locations} containers={containers} fertilizers={fertilizers} unitSystem={user.unitSystem} />
    </div>
  );
}
