import Link from "next/link";
import Image from "next/image";
import { Sprout, TriangleAlert } from "lucide-react";
import { formatRelativeDueDate } from "@/lib/units";
import { computePlantStatus } from "@/lib/plantStatus";
import { CareTypeIcon } from "@/components/careIcons";

export interface PlantCardData {
  id: string;
  name: string;
  scientificName?: string | null;
  photoUrl?: string | null;
  fallbackImageUrl?: string | null;
  nextTask?: { type: string; dueAt: Date | string } | null;
}

const ACTION_LABEL: Record<string, string> = {
  WATERING: "À arroser",
  FERTILIZING: "À fertiliser",
  REPOTTING: "À rempoter",
  PRUNING: "À tailler",
  INSPECTION: "À inspecter",
  OTHER: "À faire",
};

export default function PlantCard({ plant }: { plant: PlantCardData }) {
  const status = computePlantStatus(plant.nextTask?.dueAt ?? null);
  const image = plant.photoUrl || plant.fallbackImageUrl;

  // On ne signale que ce qui merite reellement l'attention : rien pour une
  // plante saine ou une echeance encore lointaine (evite le mur de badges
  // "En bonne sante" identiques constate sur l'ecran "Mes plantes").
  const chip =
    status === "attention"
      ? { label: "Attention", tone: "attention" as const }
      : status === "today" && plant.nextTask
        ? { label: ACTION_LABEL[plant.nextTask.type] ?? "À faire", tone: "action" as const }
        : null;

  return (
    <Link href={`/plantes/${plant.id}`} className="card group block overflow-hidden">
      <div className="relative aspect-square w-full overflow-hidden" style={{ background: "var(--surface-alt)" }}>
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            // image peut rester une URL externe brute si le mirroring a
            // echoue (best-effort, voir resolvePhotoUrl) -- unoptimized
            // contourne alors la restriction remotePatterns sans crasher,
            // au prix de l'optimisation pour ce seul cas rare.
            unoptimized={image.startsWith("http")}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center" style={{ color: "var(--secondary)" }}>
            <Sprout size={40} strokeWidth={1.5} />
          </div>
        )}
        {chip && (
          <span className={`badge badge-${chip.tone === "attention" ? "attention" : "today"} absolute left-2.5 top-2.5`} style={{ background: "var(--surface)" }}>
            {chip.tone === "attention" ? (
              <TriangleAlert size={12} />
            ) : (
              plant.nextTask && <CareTypeIcon type={plant.nextTask.type} size={12} colored={false} />
            )}
            {chip.label}
          </span>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate font-medium leading-tight">{plant.name}</p>
        {plant.scientificName && <p className="text-muted truncate text-xs italic">{plant.scientificName}</p>}
        {plant.nextTask && (
          <p className="text-muted flex items-center gap-1 pt-0.5 text-xs">
            <CareTypeIcon type={plant.nextTask.type} size={12} />
            {formatRelativeDueDate(plant.nextTask.dueAt)}
          </p>
        )}
      </div>
    </Link>
  );
}
