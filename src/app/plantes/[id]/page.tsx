import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { requireSessionUserId } from "@/lib/session";
import { db } from "@/server/db";
import QuickActions from "@/components/QuickActions";
import PlantPhotoGallery from "@/components/PlantPhotoGallery";
import PlantCoverPhoto from "@/components/PlantCoverPhoto";
import PhotoViewerProvider from "@/components/PhotoViewerProvider";
import StatusBadge from "@/components/StatusBadge";
import { CareTypeIcon, careSoftBackground } from "@/components/careIcons";
import { computePlantStatus } from "@/lib/plantStatus";
import { formatDate, formatDistanceMm, formatRelativeDueDate } from "@/lib/units";

const RULE_LABEL: Record<string, string> = { WATERING: "Arrosage", FERTILIZING: "Fertilisation", REPOTTING: "Rempotage" };
const NOTE_CATEGORY_LABEL: Record<string, string> = {
  OBSERVATION: "Observation",
  MALADIE: "Maladie",
  PARASITE: "Parasite",
  CROISSANCE: "Croissance",
  FLORAISON: "Floraison",
  AUTRE: "Autre",
};

export default async function PlantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireSessionUserId();

  const plant = await db.plant.findFirst({
    where: { id, userId },
    include: {
      location: true,
      careRules: { orderBy: { createdAt: "asc" } },
      tasks: { where: { status: "PENDING" }, orderBy: { dueAt: "asc" } },
      sensors: { include: { readings: { orderBy: { recordedAt: "desc" }, take: 1 } } },
      photos: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!plant) notFound();

  // Backfill : une photo de couverture choisie avant l'introduction de la
  // galerie n'existe pas encore comme PlantPhoto -- on l'y ajoute au premier
  // affichage pour qu'elle apparaisse dans la liste (et reste choisissable
  // si l'utilisateur change puis revient dessus).
  if (plant.photoUrl && !plant.photos.some((p) => p.url === plant.photoUrl)) {
    const backfilled = await db.plantPhoto.create({ data: { plantId: plant.id, url: plant.photoUrl } });
    plant.photos.push(backfilled);
  }

  const [recentEvents, notes, libraryEntry] = await Promise.all([
    db.careEvent.findMany({ where: { plantId: id }, orderBy: { performedAt: "desc" }, take: 5 }),
    db.note.findMany({ where: { plantId: id }, orderBy: { createdAt: "desc" }, take: 5 }),
    plant.photoUrl || !plant.scientificName
      ? null
      : db.plantLibraryEntry.findFirst({ where: { scientificName: plant.scientificName }, select: { careProfile: true } }),
  ]);
  const fallbackImageUrl = (libraryEntry?.careProfile as { imageUrl?: string } | null)?.imageUrl ?? null;

  const now = new Date();
  const status = computePlantStatus(plant.tasks[0]?.dueAt ?? null);
  const infoRows: Array<{ label: string; value: string | null | undefined }> = [
    { label: "Exposition", value: plant.exposure },
    { label: "Substrat", value: plant.substrate },
    { label: "Taille du pot", value: plant.potDiameterMm ? `${formatDistanceMm(plant.potDiameterMm)} de diamètre` : null },
    { label: "Matériau du pot", value: plant.potMaterial },
    { label: "Acquisition", value: plant.acquiredAt ? formatDate(plant.acquiredAt) : null },
  ].filter((row) => row.value);

  const photoUrls = plant.photos.map((p) => p.url);

  return (
    <PhotoViewerProvider>
    <div className="space-y-7">
      <div className="animate-rise-in overflow-hidden rounded-2xl" style={{ background: "var(--surface-alt)" }}>
        <div className="relative aspect-[16/10] w-full sm:aspect-[21/9]">
          <PlantCoverPhoto photos={photoUrls} coverUrl={plant.photoUrl} fallbackImageUrl={fallbackImageUrl} />
          <Link
            href={`/plantes/${plant.id}/modifier`}
            className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium backdrop-blur-sm"
            style={{ background: "var(--surface)", color: "var(--ink)" }}
          >
            <Pencil size={14} /> Modifier
          </Link>
        </div>
        <div className="space-y-2 p-4">
          <div className="min-w-0">
            <h1 className="font-display truncate text-2xl font-semibold">{plant.name}</h1>
            {plant.scientificName && <p className="text-muted truncate italic">{plant.scientificName}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <span className="text-muted text-sm">{plant.location?.name ?? "Sans emplacement"}</span>
          </div>
        </div>
      </div>

      <section className="animate-rise-in space-y-3">
        <h2 className="text-lg font-semibold">Entretien</h2>
        <div className="card p-0">
          {plant.careRules.length === 0 && <p className="text-muted p-4 text-sm">Aucune règle d&apos;entretien définie.</p>}
          {plant.careRules.map((rule) => {
            const task = plant.tasks.find((t) => t.careRuleId === rule.id);
            const overdue = Boolean(task && task.dueAt < now);
            return (
              <div
                key={rule.id}
                className="flex items-center gap-3 border-t p-3.5 first:border-t-0"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ background: careSoftBackground(rule.type) }}
                >
                  <CareTypeIcon type={rule.type} size={17} />
                </div>
                <span className="flex-1 text-sm font-medium">{RULE_LABEL[rule.type]}</span>
                <span
                  className="text-sm"
                  style={overdue ? { color: "var(--danger)", fontWeight: 600 } : undefined}
                >
                  {!rule.enabled ? "Désactivé" : task ? formatRelativeDueDate(task.dueAt) : "Manuel"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <PlantPhotoGallery plantId={plant.id} photos={plant.photos} coverUrl={plant.photoUrl} />

      {infoRows.length > 0 && (
        <section className="animate-rise-in space-y-3">
          <h2 className="text-lg font-semibold">Informations</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {infoRows.map((row) => (
              <div key={row.label} className="card p-3">
                <p className="text-muted text-xs uppercase tracking-wide">{row.label}</p>
                <p className="mt-1 text-sm font-medium leading-snug">{row.value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {plant.sensors.length > 0 && (
        <section className="card space-y-2 p-4 text-sm">
          <h2 className="mb-1 font-semibold">Capteurs</h2>
          {plant.sensors.map((sensor) => {
            const latest = sensor.readings[0];
            return (
              <div key={sensor.id} className="flex justify-between">
                <span className="text-muted">{sensor.name}</span>
                <span>{latest ? `${latest.value} ${latest.unit} · ${formatDate(latest.recordedAt)}` : "Aucune mesure"}</span>
              </div>
            );
          })}
        </section>
      )}

      <section className="animate-rise-in space-y-2">
        <h2 className="text-lg font-semibold">Actions rapides</h2>
        <QuickActions
          plantId={plant.id}
          careRules={plant.careRules.map((r) => ({
            id: r.id,
            type: r.type,
            configuration: r.configuration as Record<string, unknown> | null,
          }))}
        />
      </section>

      <section className="animate-rise-in space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Historique récent</h2>
          <Link href={`/historique?plant=${plant.id}`} className="text-sm font-medium" style={{ color: "var(--primary-strong)" }}>
            Tout voir
          </Link>
        </div>
        {recentEvents.length === 0 && <p className="text-muted text-sm">Aucun événement enregistré.</p>}
        <div className="space-y-1.5">
          {recentEvents.map((ev) => (
            <div key={ev.id} className="card flex items-center gap-3 p-3 text-sm">
              <CareTypeIcon type={ev.type} size={16} className="shrink-0" />
              <span className="flex-1">{formatDate(ev.performedAt)}</span>
              <span className="text-muted">{ev.quantity ? `${ev.quantity} ${ev.unit ?? ""}` : (ev.note ?? "")}</span>
            </div>
          ))}
        </div>
      </section>

      {plant.notes && (
        <section className="card p-4 text-sm">
          <h2 className="mb-1 font-semibold">Notes générales</h2>
          <p className="text-muted whitespace-pre-wrap">{plant.notes}</p>
        </section>
      )}

      {notes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Observations</h2>
          {notes.map((note) => (
            <div key={note.id} className="card space-y-1 p-3 text-sm">
              <div className="text-muted flex justify-between text-xs">
                <span>{NOTE_CATEGORY_LABEL[note.category] ?? note.category}</span>
                <span>{formatDate(note.createdAt)}</span>
              </div>
              <p>{note.content}</p>
            </div>
          ))}
        </section>
      )}
    </div>
    </PhotoViewerProvider>
  );
}
