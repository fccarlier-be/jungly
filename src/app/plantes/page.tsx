import Link from "next/link";
import { ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { requireSessionUserId } from "@/lib/session";
import { db } from "@/server/db";
import PlantCard from "@/components/PlantCard";
import { computePlantStatus } from "@/lib/plantStatus";
import { effectiveDueDate } from "@/server/careEngine/dueTasks";

const PRIMARY_FILTERS = [
  { value: "all", label: "Toutes" },
  { value: "due", label: "À faire" },
  { value: "watch", label: "À surveiller" },
];

const SECONDARY_FILTERS = [
  { value: "watering", label: "À arroser" },
  { value: "fertilizing", label: "À fertiliser" },
  { value: "overdue", label: "En retard" },
  { value: "none", label: "Aucune tâche" },
];

const SORTS = [
  { value: "name", label: "Nom" },
  { value: "nextTask", label: "Prochaine tâche" },
  { value: "location", label: "Emplacement" },
  { value: "createdAt", label: "Date d'ajout" },
];

export default async function PlantsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; sort?: string }>;
}) {
  const { filter = "all", sort = "name" } = await searchParams;
  const userId = await requireSessionUserId();

  const plants = await db.plant.findMany({
    where: { userId },
    include: {
      location: true,
      // SNOOZED inclus : une tache reportee redevient due a snoozedUntil,
      // pas a son ancien dueAt (voir effectiveDueDate). L'ordre est
      // recalcule cote JS ci-dessous puisque Prisma ne peut pas trier par
      // "dueAt ou snoozedUntil selon le statut" directement en base.
      tasks: { where: { status: { in: ["PENDING", "SNOOZED"] } } },
    },
    orderBy: sort === "location" ? { location: { name: "asc" } } : sort === "createdAt" ? { createdAt: "desc" } : { name: "asc" },
  });

  const scientificNames = Array.from(new Set(plants.map((p) => p.scientificName).filter((n): n is string => Boolean(n))));
  const libraryEntries = scientificNames.length
    ? await db.plantLibraryEntry.findMany({ where: { scientificName: { in: scientificNames } }, select: { scientificName: true, careProfile: true } })
    : [];
  const fallbackImageByName = new Map(
    libraryEntries.map((e) => [e.scientificName, (e.careProfile as { imageUrl?: string } | null)?.imageUrl ?? null]),
  );

  const now = new Date();
  let items = plants.map((plant) => {
    // dueAt est remplace par sa date effective (voir effectiveDueDate) : une
    // tache SNOOZED s'ordonne et s'affiche a sa date de report, pas a son
    // ancienne echeance.
    const tasks = plant.tasks
      .map((t) => ({ ...t, dueAt: effectiveDueDate(t) }))
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    const nextTask = tasks[0] ?? null;
    return {
      ...plant,
      tasks,
      nextTask,
      overdue: tasks.some((t) => t.dueAt < now),
      status: computePlantStatus(nextTask?.dueAt ?? null),
      fallbackImageUrl: plant.scientificName ? (fallbackImageByName.get(plant.scientificName) ?? null) : null,
    };
  });

  items = items.filter((plant) => {
    switch (filter) {
      case "due":
        return plant.status === "today" || plant.status === "attention";
      case "watch":
        return plant.status === "watch";
      case "watering":
        return plant.tasks.some((t) => t.type === "WATERING");
      case "fertilizing":
        return plant.tasks.some((t) => t.type === "FERTILIZING");
      case "overdue":
        return plant.overdue;
      case "none":
        return plant.tasks.length === 0;
      default:
        return true;
    }
  });

  if (sort === "nextTask") {
    items = [...items].sort((a, b) => {
      if (!a.nextTask) return 1;
      if (!b.nextTask) return -1;
      return a.nextTask.dueAt.getTime() - b.nextTask.dueAt.getTime();
    });
  }

  const activeSecondaryFilter = SECONDARY_FILTERS.find((f) => f.value === filter);
  const activeSort = SORTS.find((s) => s.value === sort) ?? SORTS[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Mes plantes</h1>
        <Link href="/plantes/nouvelle" className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold">
          + Ajouter
        </Link>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
          {PRIMARY_FILTERS.map((f) => (
            <Link
              key={f.value}
              href={`/plantes?filter=${f.value}&sort=${sort}`}
              className={`chip shrink-0 rounded-full px-3.5 py-1.5 text-sm ${filter === f.value ? "chip-active" : ""}`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        <div className="flex shrink-0 gap-1.5 text-sm">
          <details className="relative">
            <summary className="chip flex list-none items-center gap-1.5 rounded-full px-3 py-1.5">
              <ArrowUpDown size={14} />
              <span className="hidden sm:inline">Trier</span>
            </summary>
            <div className="card absolute right-0 z-10 mt-1 w-44 space-y-0.5 p-1.5">
              {SORTS.map((s) => (
                <Link
                  key={s.value}
                  href={`/plantes?filter=${filter}&sort=${s.value}`}
                  className={`btn-ghost block rounded-lg px-2.5 py-1.5 text-sm ${s.value === activeSort.value ? "font-semibold" : ""}`}
                  style={s.value === activeSort.value ? { color: "var(--primary-strong)" } : undefined}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </details>

          <details className="relative">
            <summary className="chip flex list-none items-center gap-1.5 rounded-full px-3 py-1.5">
              <SlidersHorizontal size={14} />
              <span className="hidden sm:inline">Filtrer</span>
            </summary>
            <div className="card absolute right-0 z-10 mt-1 w-44 space-y-0.5 p-1.5">
              <Link
                href={`/plantes?filter=all&sort=${sort}`}
                className="btn-ghost block rounded-lg px-2.5 py-1.5 text-sm"
                style={!activeSecondaryFilter ? { color: "var(--primary-strong)", fontWeight: 600 } : undefined}
              >
                Tout afficher
              </Link>
              {SECONDARY_FILTERS.map((f) => (
                <Link
                  key={f.value}
                  href={`/plantes?filter=${f.value}&sort=${sort}`}
                  className="btn-ghost block rounded-lg px-2.5 py-1.5 text-sm"
                  style={f.value === filter ? { color: "var(--primary-strong)", fontWeight: 600 } : undefined}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-muted py-8 text-center">Aucune plante ne correspond à ce filtre.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((plant) => (
            <PlantCard key={plant.id} plant={plant} />
          ))}
        </div>
      )}
    </div>
  );
}
