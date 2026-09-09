import Link from "next/link";
import { Sprout, Lightbulb } from "lucide-react";
import { requireSessionUserId } from "@/lib/session";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { dueTasksWhere } from "@/server/careEngine/dueTasks";
import { CareTypeIcon } from "@/components/careIcons";
import TaskCard, { type TaskCardData } from "@/components/TaskCard";
import EmptyState from "@/components/EmptyState";
import { getLibraryImageMap } from "@/lib/libraryImages";

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

function heroMessage(taskCount: number, overdueCount: number): string {
  if (taskCount === 0) return "Tout va bien dans la jungle. Rien ne t'attend aujourd'hui.";
  if (overdueCount > 0) {
    return `${overdueCount} plante${overdueCount > 1 ? "s a" : " a"} besoin${overdueCount > 1 ? "" : ""} de toi, un peu en retard.`;
  }
  if (taskCount === 1) return "Une petite chose t'attend aujourd'hui.";
  return `Petite tournée d'arrosage : ${taskCount} tâches t'attendent aujourd'hui.`;
}

export default async function DashboardPage() {
  const userId = await requireSessionUserId();
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] || session?.user?.email?.split("@")[0] || "";

  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [tasks, allPlants] = await Promise.all([
    db.task.findMany({
      where: { plant: { userId }, ...dueTasksWhere(endOfToday) },
      include: { plant: true, careRule: true },
      orderBy: { dueAt: "asc" },
    }),
    db.plant.findMany({ where: { userId }, include: { libraryEntry: true }, orderBy: { name: "asc" } }),
  ]);
  const plantCount = allPlants.length;

  const overdueCount = tasks.filter((t) => t.dueAt < startOfToday).length;

  const libraryImageByName = await getLibraryImageMap(tasks.map((t) => t.plant.scientificName));

  const collection = allPlants.map((plant) => ({
    id: plant.id,
    name: plant.name,
    image: plant.photoUrl || (plant.libraryEntry?.careProfile as { imageUrl?: string } | null)?.imageUrl || null,
  }));

  const tipCandidates = allPlants
    .map((plant) => ({ name: plant.name, tip: (plant.libraryEntry?.careProfile as { tips?: string } | null)?.tips }))
    .filter((c): c is { name: string; tip: string } => Boolean(c.tip));
  const dailyTip = tipCandidates.length > 0 ? tipCandidates[dayOfYear(now) % tipCandidates.length] : null;

  const fertilizerIds = Array.from(
    new Set(
      tasks
        .filter((t) => t.type === "FERTILIZING")
        .map((t) => (t.careRule?.configuration as { fertilizerId?: string } | null)?.fertilizerId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const fertilizers = fertilizerIds.length
    ? await db.fertilizer.findMany({ where: { id: { in: fertilizerIds } } })
    : [];

  const cards: TaskCardData[] = tasks.map((task) => {
    let subtitle: string | undefined;
    if (task.type === "FERTILIZING") {
      const config = task.careRule?.configuration as
        | { fertilizerId?: string; dosagePerLiter?: number; dosageUnit?: string }
        | null;
      const fertilizer = fertilizers.find((f) => f.id === config?.fertilizerId);
      if (fertilizer) {
        const npk =
          fertilizer.nitrogen != null && fertilizer.phosphorus != null && fertilizer.potassium != null
            ? `NPK ${fertilizer.nitrogen}-${fertilizer.phosphorus}-${fertilizer.potassium}`
            : null;
        const dosage = config?.dosagePerLiter ? `${config.dosagePerLiter} ${config.dosageUnit ?? "ml"}/L` : null;
        subtitle = [fertilizer.name, npk, dosage].filter(Boolean).join(" · ");
      }
    }
    return {
      id: task.id,
      plantId: task.plantId,
      type: task.type,
      title: task.title,
      dueAt: task.dueAt,
      plant: task.plant,
      plantImage: task.plant.photoUrl || (task.plant.scientificName ? libraryImageByName.get(task.plant.scientificName) : null),
      subtitle,
    };
  });

  const counts: Record<string, number> = {};
  for (const task of tasks) {
    counts[task.type] = (counts[task.type] ?? 0) + 1;
  }

  return (
    <div className="space-y-7">
      <div className="animate-rise-in space-y-2">
        <h1 className="font-display text-3xl font-semibold" style={{ color: "var(--primary-strong)" }}>
          {greeting()}
          {firstName ? ` ${firstName}` : ""} 🌿
        </h1>
        <p className="text-muted text-base">{heroMessage(tasks.length, overdueCount)}</p>
      </div>

      {Object.keys(counts).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(counts).map(([type, count]) => (
            <span key={type} className="card flex items-center gap-1.5 px-3 py-1.5 text-sm">
              <CareTypeIcon type={type} size={16} className="text-current" />
              {count}
            </span>
          ))}
        </div>
      )}

      {cards.length === 0 ? (
        plantCount === 0 ? (
          <EmptyState
            icon={<Sprout size={40} strokeWidth={1.5} />}
            title="Ta jungle commence ici."
            description="Ajoute ta première plante pour commencer à suivre ses besoins."
            actionHref="/plantes/nouvelle"
            actionLabel="Ajouter une plante"
          />
        ) : (
          <EmptyState
            icon={<span className="text-4xl">🌤️</span>}
            title="Rien à faire aujourd'hui."
            description="Toutes tes plantes sont à jour. Prends un café."
          />
        )
      ) : (
        <div className="space-y-3">
          {cards.map((task, i) => (
            <div key={task.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
              <TaskCard task={task} />
            </div>
          ))}
        </div>
      )}

      {dailyTip && (
        <section className="animate-rise-in card flex gap-3 p-4">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--primary-soft)", color: "var(--primary-strong)" }}
          >
            <Lightbulb size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-muted text-xs uppercase tracking-wide">Le saviez-vous ? · {dailyTip.name}</p>
            <p className="mt-1 text-sm leading-snug">{dailyTip.tip}</p>
          </div>
        </section>
      )}

      {collection.length > 0 && (
        <section className="animate-rise-in space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Ma collection</h2>
            <Link href="/plantes" className="text-sm font-medium" style={{ color: "var(--primary-strong)" }}>
              Tout voir
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {collection.map((plant) => (
              <Link key={plant.id} href={`/plantes/${plant.id}`} className="w-16 shrink-0 text-center">
                <div
                  className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-full"
                  style={{ background: "var(--surface-alt)" }}
                >
                  {plant.image ? (
                    <img src={plant.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Sprout size={22} strokeWidth={1.5} style={{ color: "var(--secondary)" }} />
                  )}
                </div>
                <p className="text-muted mt-1 truncate text-xs">{plant.name}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
