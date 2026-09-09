import Link from "next/link";
import { requireSessionUserId } from "@/lib/session";
import { db } from "@/server/db";
import FertilizerManager from "@/components/FertilizerManager";

export default async function FertilizersPage() {
  const userId = await requireSessionUserId();
  const fertilizers = await db.fertilizer.findMany({ where: { userId }, orderBy: { name: "asc" } });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Mes engrais</h1>
        <Link href="/parametres" className="text-sm font-medium" style={{ color: "var(--primary-strong)" }}>
          Paramètres
        </Link>
      </div>
      <p className="text-muted text-sm">
        Ta bibliothèque personnelle d&apos;engrais, réutilisable lors de la création d&apos;une règle de fertilisation.
      </p>
      <FertilizerManager fertilizers={fertilizers} />
    </div>
  );
}
