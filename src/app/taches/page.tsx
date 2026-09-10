import { requireSessionUserId } from "@/lib/session";
import { db } from "@/server/db";
import { effectiveDueDate, isTaskDueNow } from "@/server/careEngine/dueTasks";
import TaskCard, { type TaskCardData } from "@/components/TaskCard";
import EmptyState from "@/components/EmptyState";
import { getLibraryImageMap } from "@/lib/libraryImages";

export default async function TasksPage() {
  const userId = await requireSessionUserId();

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const rawTasks = await db.task.findMany({
    where: { status: { in: ["PENDING", "SNOOZED"] }, plant: { userId } },
    include: { plant: true },
    orderBy: { dueAt: "asc" },
  });

  const libraryImageByName = await getLibraryImageMap(rawTasks.map((t) => t.plant.scientificName));
  // dueAt est remplace par sa date effective (snoozedUntil pour une tache
  // reportee, voir effectiveDueDate) : sans ca, une tache snoozee continuait
  // d'afficher et de trier sur son ancienne echeance (ex. "en retard de 5
  // jours" pour une tache en realite reportee a demain).
  const tasks = rawTasks
    .map((t) => ({
      ...t,
      dueAt: effectiveDueDate(t),
      plantImage: t.plant.photoUrl || (t.plant.scientificName ? libraryImageByName.get(t.plant.scientificName) : null),
    }))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  // Une tâche SNOOZED dont la date de report est déjà passée redevient due
  // (isTaskDueNow), au même titre qu'une tâche PENDING en retard.
  const dueNow = tasks.filter((t) => isTaskDueNow(t, now));
  const notYetDue = tasks.filter((t) => !isTaskDueNow(t, now));

  const overdue = dueNow.filter((t) => t.dueAt < startOfToday);
  const today = dueNow.filter((t) => t.dueAt >= startOfToday);
  const upcoming = notYetDue;

  const nothingAtAll = overdue.length === 0 && today.length === 0 && upcoming.length === 0;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">Tâches</h1>

      {nothingAtAll ? (
        <EmptyState icon={<span className="text-4xl">🌤️</span>} title="Rien à l'horizon." description="Aucune tâche en attente, tes plantes sont tranquilles." />
      ) : (
        <>
          <TaskSection title="En retard" tasks={overdue} emptyLabel="Aucune tâche en retard." />
          <TaskSection title="Aujourd'hui" tasks={today} emptyLabel="Rien de prévu aujourd'hui." />
          <TaskSection title="À venir" tasks={upcoming} emptyLabel="Aucune tâche à venir." />
        </>
      )}
    </div>
  );
}

function TaskSection({ title, tasks, emptyLabel }: { title: string; tasks: TaskCardData[]; emptyLabel: string }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-muted text-sm uppercase tracking-wide">{title}</h2>
      {tasks.length === 0 ? (
        <p className="text-muted text-sm">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </section>
  );
}
