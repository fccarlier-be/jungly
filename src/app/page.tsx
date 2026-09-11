import Link from "next/link";
import Image from "next/image";
import { Sprout, Leaf, Coffee, Thermometer } from "lucide-react";
import { requireSessionUserId } from "@/lib/session";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { dueTasksWhere, effectiveDueDate } from "@/server/careEngine/dueTasks";
import { multiplierShortLabel } from "@/server/weather/multiplier";
import { CareTypeIcon } from "@/components/careIcons";
import TaskCard, { type TaskCardData } from "@/components/TaskCard";
import EmptyState from "@/components/EmptyState";
import NoScrollDashboard from "@/components/NoScrollDashboard";
import UpcomingTaskCard from "@/components/UpcomingTaskCard";
import { getLibraryImageMap } from "@/lib/libraryImages";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

function heroMessage(taskCount: number, overdueCount: number): string {
  // Cas "rien a faire" : le message est fusionne dans l'encart ci-dessous
  // plutot que repete ici (le titre de l'encart dit deja "Rien a faire
  // aujourd'hui.").
  if (taskCount === 0) return "";
  if (overdueCount > 0) {
    return `${overdueCount} plante${overdueCount > 1 ? "s" : ""} ${overdueCount > 1 ? "ont" : "a"} besoin de toi, un peu en retard.`;
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

  const [tasks, allPlants, weatherProfile] = await Promise.all([
    db.task.findMany({
      where: { plant: { userId }, ...dueTasksWhere(endOfToday) },
      include: { plant: true, careRule: true },
      orderBy: { dueAt: "asc" },
    }),
    db.plant.findMany({ where: { userId }, include: { libraryEntry: true }, orderBy: { name: "asc" } }),
    db.weatherProfile.findUnique({ where: { userId }, select: { city: true, wateringIntervalMultiplier: true } }),
  ]);
  const plantCount = allPlants.length;

  const overdueCount = tasks.filter((t) => t.dueAt < startOfToday).length;

  const libraryImageByName = await getLibraryImageMap(tasks.map((t) => t.plant.scientificName));

  const collection = allPlants.map((plant) => ({
    id: plant.id,
    name: plant.name,
    image: plant.photoUrl || (plant.libraryEntry?.careProfile as { imageUrl?: string } | null)?.imageUrl || null,
  }));

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
      // Date effective (snoozedUntil si reportee), pas le dueAt brut --
      // sinon une tache reportee affiche/decale a partir de son ancienne
      // echeance plutot que de la date qui l'a effectivement rendue due.
      dueAt: effectiveDueDate(task),
      plant: task.plant,
      plantImage: task.plant.photoUrl || (task.plant.scientificName ? libraryImageByName.get(task.plant.scientificName) : null),
      subtitle,
    };
  });

  const counts: Record<string, number> = {};
  for (const task of tasks) {
    counts[task.type] = (counts[task.type] ?? 0) + 1;
  }

  // Aperçu de ce qui arrive ensuite, qu'il y ait deja des taches dues
  // aujourd'hui ou non (exclut celles deja dues, deja listees dans `cards`).
  let nextUp: { id: string; type: string; title: string; plantName: string; effectiveDate: Date }[] = [];
  if (plantCount > 0) {
    const upcoming = await db.task.findMany({
      where: { plant: { userId }, status: { in: ["PENDING", "SNOOZED"] } },
      include: { plant: true },
    });
    nextUp = upcoming
      .map((t) => ({
        id: t.id,
        type: t.type,
        title: t.title,
        plantName: t.plant.name,
        effectiveDate: effectiveDueDate(t),
      }))
      .filter((t) => t.effectiveDate.getTime() > endOfToday.getTime())
      .sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime())
      .slice(0, 3);
  }

  const hero = heroMessage(tasks.length, overdueCount);

  return (
    <div className="space-y-7">
      <div className="animate-rise-in space-y-2">
        <h1 className="font-display flex items-center gap-2 text-3xl font-semibold" style={{ color: "var(--primary-strong)" }}>
          <span>
            {greeting()}
            {firstName ? ` ${firstName}` : ""}
          </span>
          <Leaf size={26} strokeWidth={1.75} />
        </h1>
        {hero && <p className="text-muted text-base">{hero}</p>}
        {weatherProfile && (
          <div className="text-muted flex items-center gap-1.5 text-sm">
            <Thermometer size={14} />
            <span>
              {weatherProfile.city} · {multiplierShortLabel(weatherProfile.wateringIntervalMultiplier)}
            </span>
          </div>
        )}
      </div>

      <NoScrollDashboard>
        <div className="space-y-7">
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
                icon={<Coffee size={40} strokeWidth={1.5} />}
                title="Rien à faire aujourd'hui."
                description="Tout va bien dans la jungle : toutes tes plantes sont à jour, prends un café."
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

          {nextUp.length > 0 && (
            <div className="space-y-2">
              <p className="text-muted text-xs uppercase tracking-wide">Prochaines échéances</p>
              {nextUp.map((task) => (
                <UpcomingTaskCard key={task.id} task={task} />
              ))}
            </div>
          )}

        </div>
      </NoScrollDashboard>

      {collection.length > 0 && (
        // Meme design partout (grandes vignettes, en-tete "Tout voir") --
        // seule la position change : fixee au-dessus de la nav sur mobile
        // (et tablette, voir le seuil lg plutot que md dans layout.tsx) pour
        // rester toujours visible sans avoir a scroller, normale dans le
        // flux sur desktop. data-collection-bar : NoScrollDashboard s'en
        // sert pour mesurer exactement ou s'arreter, plutot qu'un espaceur a
        // hauteur fixe qui se desynchronise a la moindre variation du
        // contenu au-dessus (voir cette section jusqu'a la derniere fois).
        <section
          data-collection-bar
          className="animate-rise-in fixed inset-x-0 bottom-16 z-10 space-y-3 py-3 lg:static lg:inset-auto lg:z-auto lg:py-0"
          style={{ background: "var(--bg)" }}
        >
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 lg:max-w-none lg:px-0">
            <h2 className="text-lg font-semibold">Ma collection</h2>
            <Link href="/plantes" className="text-sm font-medium" style={{ color: "var(--primary-strong)" }}>
              Tout voir
            </Link>
          </div>
          {/* Espaceur (et non un padding sur le conteneur) : Safari/WebKit
              ignore le padding-inline-start d'un conteneur flex qui defile
              horizontalement (bug connu), il faut donc un vrai element pour
              creer l'espace avant le premier cercle. Il porte lui-meme
              snap-start : sans ca, avec snap-mandatory, Safari aligne de
              force la position de repos sur le premier point d'ancrage (le
              premier cercle) et annule visuellement l'espaceur au
              chargement. Pas d'equivalent a droite : la rangee reste bord a
              bord de ce cote en scrollant (coupe nette assumee). */}
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
            <div className="w-0 shrink-0 snap-start" aria-hidden />
            {collection.map((plant) => (
              <Link key={plant.id} href={`/plantes/${plant.id}`} className="w-16 shrink-0 snap-start text-center">
                <div
                  className="relative mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-full"
                  style={{ background: "var(--surface-alt)" }}
                >
                  {plant.image ? (
                    <Image
                      src={plant.image}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover"
                      unoptimized={plant.image.startsWith("http")}
                    />
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
