import { db } from "@/server/db";
import { computePlantStatus, type PlantStatus } from "@/lib/plantStatus";
import { formatDate, formatDistanceMm, formatRelativeDueDate } from "@/lib/units";
import { effectiveDueDate } from "@/server/careEngine/dueTasks";
import { getLibraryImageMap } from "@/lib/libraryImages";
import { RULE_LABEL } from "@/lib/careRuleLabels";

const NOTE_CATEGORY_LABEL: Record<string, string> = {
  OBSERVATION: "Observation",
  MALADIE: "Maladie",
  PARASITE: "Parasite",
  CROISSANCE: "Croissance",
  FLORAISON: "Floraison",
  AUTRE: "Autre",
};

export interface CareRuleView {
  id: string;
  type: string;
  statusLabel: string;
  overdue: boolean;
  configuration: Record<string, unknown> | null;
}

export interface SensorView {
  id: string;
  name: string;
  readingLabel: string;
}

export interface EventView {
  id: string;
  type: string;
  dateLabel: string;
  detailLabel: string;
}

export interface NoteView {
  id: string;
  categoryLabel: string;
  content: string;
  dateLabel: string;
}

export interface PlantDetailData {
  id: string;
  name: string;
  scientificName: string | null;
  locationName: string | null;
  photoUrl: string | null;
  fallbackImageUrl: string | null;
  photos: { id: string; url: string }[];
  status: PlantStatus;
  careRules: CareRuleView[];
  infoRows: { label: string; value: string }[];
  sensors: SensorView[];
  recentEvents: EventView[];
  generalNotes: string | null;
  observationNotes: NoteView[];
}

/**
 * Charge et met en forme (chaines deja formatees, plus de logique de date/
 * unite cote client) la fiche complete de TOUTES les plantes de
 * l'utilisateur en un seul aller-retour serveur -- utilise par la fiche
 * plante pour monter d'un coup l'integralite du carrousel swipable
 * (PlantCarousel) : aucun rechargement au moment de naviguer d'une plante a
 * l'autre, tout est deja la.
 */
export async function getAllPlantDetails(userId: string): Promise<PlantDetailData[]> {
  const { unitSystem } = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { unitSystem: true } });

  const plants = await db.plant.findMany({
    where: { userId },
    include: {
      location: true,
      careRules: { orderBy: { createdAt: "asc" } },
      // SNOOZED inclus (voir #9/#10) : sans ca, une tache reportee
      // disparaissait de la fiche plante (ligne de regle "Manuel", statut
      // de la plante ignorant la tache en realite juste repoussee).
      tasks: { where: { status: { in: ["PENDING", "SNOOZED"] } } },
      sensors: { include: { readings: { orderBy: { recordedAt: "desc" }, take: 1 } } },
      photos: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { name: "asc" },
  });
  if (plants.length === 0) return [];

  // Backfill : une photo de couverture choisie avant l'introduction de la
  // galerie n'existe pas encore comme PlantPhoto -- on l'y ajoute au premier
  // affichage pour qu'elle apparaisse dans la liste (et reste choisissable
  // si l'utilisateur change puis revient dessus).
  for (const plant of plants) {
    if (plant.photoUrl && !plant.photos.some((p) => p.url === plant.photoUrl)) {
      const backfilled = await db.plantPhoto.create({ data: { plantId: plant.id, url: plant.photoUrl } });
      plant.photos.push(backfilled);
    }
  }

  const plantIds = plants.map((p) => p.id);
  const [allRecentEvents, allNotes] = await Promise.all([
    db.careEvent.findMany({ where: { plantId: { in: plantIds } }, orderBy: { performedAt: "desc" } }),
    db.note.findMany({ where: { plantId: { in: plantIds } }, orderBy: { createdAt: "desc" } }),
  ]);
  const eventsByPlant = new Map<string, typeof allRecentEvents>();
  for (const ev of allRecentEvents) {
    const list = eventsByPlant.get(ev.plantId) ?? [];
    if (list.length < 5) list.push(ev);
    eventsByPlant.set(ev.plantId, list);
  }
  const notesByPlant = new Map<string, typeof allNotes>();
  for (const note of allNotes) {
    const list = notesByPlant.get(note.plantId) ?? [];
    if (list.length < 5) list.push(note);
    notesByPlant.set(note.plantId, list);
  }

  const fallbackImageMap = await getLibraryImageMap(plants.map((p) => p.scientificName));

  const now = new Date();

  return plants.map((plant) => {
    const tasks = plant.tasks
      .map((t) => ({ ...t, dueAt: effectiveDueDate(t) }))
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    const status = computePlantStatus(tasks[0]?.dueAt ?? null);

    const careRules: CareRuleView[] = plant.careRules.map((rule) => {
      const task = tasks.find((t) => t.careRuleId === rule.id);
      const overdue = Boolean(task && task.dueAt < now);
      return {
        id: rule.id,
        type: rule.type,
        statusLabel: !rule.enabled ? "Désactivé" : task ? formatRelativeDueDate(task.dueAt) : "Manuel",
        overdue,
        configuration: rule.configuration as Record<string, unknown> | null,
      };
    });

    const infoRows: Array<{ label: string; value: string }> = [
      { label: "Exposition", value: plant.exposure },
      { label: "Substrat", value: plant.substrate },
      { label: "Taille du pot", value: plant.potDiameterMm ? `${formatDistanceMm(plant.potDiameterMm, unitSystem)} de diamètre` : null },
      { label: "Matériau du pot", value: plant.potMaterial },
      { label: "Acquisition", value: plant.acquiredAt ? formatDate(plant.acquiredAt) : null },
    ].filter((row): row is { label: string; value: string } => Boolean(row.value));

    const sensors: SensorView[] = plant.sensors.map((sensor) => {
      const latest = sensor.readings[0];
      return {
        id: sensor.id,
        name: sensor.name,
        readingLabel: latest ? `${latest.value} ${latest.unit} · ${formatDate(latest.recordedAt)}` : "Aucune mesure",
      };
    });

    const recentEvents: EventView[] = (eventsByPlant.get(plant.id) ?? []).map((ev) => ({
      id: ev.id,
      type: ev.type,
      dateLabel: formatDate(ev.performedAt),
      detailLabel: ev.quantity ? `${ev.quantity} ${ev.unit ?? ""}` : (ev.note ?? ""),
    }));

    const observationNotes: NoteView[] = (notesByPlant.get(plant.id) ?? []).map((note) => ({
      id: note.id,
      categoryLabel: NOTE_CATEGORY_LABEL[note.category] ?? note.category,
      content: note.content,
      dateLabel: formatDate(note.createdAt),
    }));

    return {
      id: plant.id,
      name: plant.name,
      scientificName: plant.scientificName,
      locationName: plant.location?.name ?? null,
      photoUrl: plant.photoUrl,
      fallbackImageUrl:
        plant.photoUrl || !plant.scientificName ? null : (fallbackImageMap.get(plant.scientificName) ?? null),
      photos: plant.photos.map((p) => ({ id: p.id, url: p.url })),
      status,
      careRules,
      infoRows,
      sensors,
      recentEvents,
      generalNotes: plant.notes,
      observationNotes,
    };
  });
}
