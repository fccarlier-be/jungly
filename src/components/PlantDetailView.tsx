import Link from "next/link";
import { Pencil } from "lucide-react";
import QuickActions from "@/components/QuickActions";
import PlantPhotoGallery from "@/components/PlantPhotoGallery";
import PlantCoverPhoto from "@/components/PlantCoverPhoto";
import StatusBadge from "@/components/StatusBadge";
import { CareTypeIcon, careSoftBackground } from "@/components/careIcons";
import type { PlantDetailData } from "@/lib/plantDetailData";
import { RULE_LABEL } from "@/lib/careRuleLabels";

/**
 * Rendu complet d'une fiche plante -- toutes les chaines affichees sont
 * deja formatees par getAllPlantDetails (aucune logique de date/unite ici),
 * pour rester un simple composant d'affichage utilisable a la fois comme
 * fiche active et comme volet du carrousel (PlantCarousel).
 */
export default function PlantDetailView({ plant }: { plant: PlantDetailData }) {
  const photoUrls = plant.photos.map((p) => p.url);

  return (
    <div className="space-y-7">
      <div className="animate-rise-in overflow-hidden rounded-2xl" style={{ background: "var(--surface-alt)" }}>
        <div className="relative aspect-[16/10] w-full sm:aspect-[21/9]">
          <PlantCoverPhoto photos={photoUrls} coverUrl={plant.photoUrl} fallbackImageUrl={plant.fallbackImageUrl} />
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
            <StatusBadge status={plant.status} />
            <span className="text-muted text-sm">{plant.locationName ?? "Sans emplacement"}</span>
          </div>
        </div>
      </div>

      <section className="animate-rise-in space-y-3">
        <h2 className="text-lg font-semibold">Entretien</h2>
        <div className="card p-0">
          {plant.careRules.length === 0 && <p className="text-muted p-4 text-sm">Aucune règle d&apos;entretien définie.</p>}
          {plant.careRules.map((rule) => (
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
              <span className="text-sm" style={rule.overdue ? { color: "var(--danger)", fontWeight: 600 } : undefined}>
                {rule.statusLabel}
              </span>
            </div>
          ))}
        </div>
      </section>

      <PlantPhotoGallery plantId={plant.id} photos={plant.photos} coverUrl={plant.photoUrl} />

      {plant.infoRows.length > 0 && (
        <section className="animate-rise-in space-y-3">
          <h2 className="text-lg font-semibold">Informations</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {plant.infoRows.map((row) => (
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
          {plant.sensors.map((sensor) => (
            <div key={sensor.id} className="flex justify-between">
              <span className="text-muted">{sensor.name}</span>
              <span>{sensor.readingLabel}</span>
            </div>
          ))}
        </section>
      )}

      <section className="animate-rise-in space-y-2">
        <h2 className="text-lg font-semibold">Actions rapides</h2>
        <QuickActions plantId={plant.id} careRules={plant.careRules.map((r) => ({ id: r.id, type: r.type, configuration: r.configuration }))} />
      </section>

      <section className="animate-rise-in space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Historique récent</h2>
          <Link href={`/historique?plant=${plant.id}`} className="text-sm font-medium" style={{ color: "var(--primary-strong)" }}>
            Tout voir
          </Link>
        </div>
        {plant.recentEvents.length === 0 && <p className="text-muted text-sm">Aucun événement enregistré.</p>}
        <div className="space-y-1.5">
          {plant.recentEvents.map((ev) => (
            <div key={ev.id} className="card flex items-center gap-3 p-3 text-sm">
              <CareTypeIcon type={ev.type} size={16} className="shrink-0" />
              <span className="flex-1">{ev.dateLabel}</span>
              <span className="text-muted">{ev.detailLabel}</span>
            </div>
          ))}
        </div>
      </section>

      {plant.generalNotes && (
        <section className="card p-4 text-sm">
          <h2 className="mb-1 font-semibold">Notes générales</h2>
          <p className="text-muted whitespace-pre-wrap">{plant.generalNotes}</p>
        </section>
      )}

      {plant.observationNotes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Observations</h2>
          {plant.observationNotes.map((note) => (
            <div key={note.id} className="card space-y-1 p-3 text-sm">
              <div className="text-muted flex justify-between text-xs">
                <span>{note.categoryLabel}</span>
                <span>{note.dateLabel}</span>
              </div>
              <p>{note.content}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
