import Link from "next/link";
import { requireSessionUserId } from "@/lib/session";
import { db } from "@/server/db";
import ContainerManager from "@/components/ContainerManager";

export default async function ContainersPage() {
  const userId = await requireSessionUserId();
  const containers = await db.container.findMany({
    where: { userId },
    include: { _count: { select: { plants: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Mes jardinières</h1>
        <Link href="/parametres" className="text-sm font-medium" style={{ color: "var(--primary-strong)" }}>
          Paramètres
        </Link>
      </div>
      <p className="text-muted text-sm">
        Un contenant partagé par plusieurs plantes — utile pour une jardinière ou une tourbière. Rattache une plante
        depuis sa fiche.
      </p>
      <ContainerManager containers={containers} />
    </div>
  );
}
