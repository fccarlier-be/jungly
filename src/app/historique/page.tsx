import Link from "next/link";
import { CareEventType } from "@generated/prisma/client";
import { requireSessionUserId } from "@/lib/session";
import { db } from "@/server/db";
import { formatDate } from "@/lib/units";
import { CareAvatar } from "@/components/careIcons";
import EmptyState from "@/components/EmptyState";
import { PotSprout } from "@/components/art/paper";
import { HEALTH_LABEL } from "@/lib/plantHealth";

function parseEventType(value?: string): CareEventType | undefined {
  return value && (Object.values(CareEventType) as string[]).includes(value) ? (value as CareEventType) : undefined;
}

const TYPES = [
  { value: "", label: "Tous" },
  { value: "WATERING", label: "Arrosages" },
  { value: "FERTILIZING", label: "Fertilisations" },
  { value: "REPOTTING", label: "Rempotages" },
  { value: "PRUNING", label: "Tailles" },
  { value: "INSPECTION", label: "Inspections" },
];

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; plant?: string }>;
}) {
  const { type, plant } = await searchParams;
  const userId = await requireSessionUserId();

  const typeFilter = parseEventType(type);

  const events = await db.careEvent.findMany({
    where: {
      plant: { userId },
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(plant ? { plantId: plant } : {}),
    },
    include: { plant: true },
    orderBy: { performedAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">Historique</h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TYPES.map((t) => (
          <Link
            key={t.value}
            href={`/historique?type=${t.value}${plant ? `&plant=${plant}` : ""}`}
            className={`chip shrink-0 rounded-full px-3.5 py-1.5 text-sm ${(type ?? "") === t.value ? "chip-active" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {events.length === 0 ? (
        <EmptyState icon={<PotSprout className="h-24 w-auto" />} title="Rien à raconter, encore." description="Les arrosages et soins que tu enregistres apparaîtront ici." />
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="card flex items-center gap-3 p-3 text-sm">
              <CareAvatar type={event.type} size={30} />
              <span className="flex-1 font-medium">{event.plant.name}</span>
              <span className="text-muted">{formatDate(event.performedAt)}</span>
              {event.healthLevel && <span className="text-muted">Santé : {HEALTH_LABEL[event.healthLevel]}</span>}
              {(event.quantity != null || event.note) && (
                <span className="text-muted">
                  {event.quantity != null ? `${event.quantity} ${event.unit ?? ""}` : ""}
                  {event.quantity != null && event.note ? " · " : ""}
                  {event.note ?? ""}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
