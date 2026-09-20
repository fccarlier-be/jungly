"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Sprout } from "lucide-react";
import { CareTypeIcon } from "@/components/careIcons";
import ExternalSpeciesSearch from "@/components/ExternalSpeciesSearch";
import PlantPhotoIdentify, { type IdentifiedCandidate } from "@/components/PlantPhotoIdentify";
import { mmToInputUnit, inputUnitToMm, type UnitSystem } from "@/lib/units";
import {
  SUBSTRATE_TYPE_OPTIONS,
  normalizeWateringIntervalDays,
  checkContainerCompatibility,
  type SubstrateType,
  type CompatibilityPlant,
} from "@/lib/containerCompatibility";

export interface LocationOption {
  id: string;
  name: string;
}

export type ContainerOccupant = CompatibilityPlant;

export interface ContainerOption {
  id: string;
  name: string;
  occupants: ContainerOccupant[];
}

export interface FertilizerOption {
  id: string;
  name: string;
  defaultDosage?: number | null;
  dosageUnit?: string | null;
}

export interface LibraryCareProfile {
  imageUrl?: string;
  exposure?: string;
  substrate?: string;
  watering?: { recurrenceType: string; interval: number; waterAmount?: number; waterUnit?: "ml" | "L" };
  fertilizing?: { recurrenceType: string; interval: number; activeFromMonth?: number; activeUntilMonth?: number };
  repotting?: { recurrenceType: string; interval: number };
}

export interface LibraryEntry {
  id: string;
  commonName: string;
  scientificName: string | null;
  careProfile: LibraryCareProfile | null;
}

export interface PlantFormInitial {
  id: string;
  name: string;
  scientificName?: string | null;
  photoUrl?: string | null;
  locationId?: string | null;
  containerId?: string | null;
  acquiredAt?: string | Date | null;
  potShape?: "ROUND" | "RECTANGULAR" | null;
  potDiameterMm?: number | null;
  potLengthMm?: number | null;
  potWidthMm?: number | null;
  potHeightMm?: number | null;
  potMaterial?: string | null;
  substrate?: string | null;
  substrateType?: SubstrateType | null;
  // Precalcule cote serveur (voir page d'edition) : la regle d'arrosage
  // reelle est geree par CareRulesManager, pas par ce formulaire en mode
  // edition (voir plus bas) -- impossible de la recalculer ici sans elle.
  wateringIntervalDays?: number | null;
  exposure?: string | null;
  notes?: string | null;
}

function toDateInputValue(value?: string | Date | null): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

const inputClass = "input w-full px-3 py-2 text-sm";
const labelClass = "text-sm font-medium block mb-1";

export default function PlantForm({
  mode,
  initial,
  locations,
  containers,
  fertilizers,
  unitSystem = "METRIC",
}: {
  mode: "create" | "edit";
  initial?: PlantFormInitial;
  locations: LocationOption[];
  containers: ContainerOption[];
  fertilizers: FertilizerOption[];
  unitSystem?: UnitSystem;
}) {
  const router = useRouter();
  const distanceUnitLabel = unitSystem === "IMPERIAL" ? "in" : "mm";

  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryResults, setLibraryResults] = useState<LibraryEntry[]>([]);
  const [libraryEntryId, setLibraryEntryId] = useState<string | null>(null);
  const [selectedLibraryName, setSelectedLibraryName] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [scientificName, setScientificName] = useState(initial?.scientificName ?? "");
  const [photoUrl, setPhotoUrl] = useState(initial?.photoUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [locationId, setLocationId] = useState(initial?.locationId ?? "");
  const [newLocationName, setNewLocationName] = useState("");
  const [containerId, setContainerId] = useState(initial?.containerId ?? "");
  const [acquiredAt, setAcquiredAt] = useState(toDateInputValue(initial?.acquiredAt));
  // Valeurs dans l'unite d'AFFICHAGE choisie par l'utilisateur (mm ou
  // pouces) -- converties vers/depuis mm uniquement a la frontiere avec
  // l'API (voir plantPayload plus bas), qui stocke toujours en mm.
  const [potShape, setPotShape] = useState<"ROUND" | "RECTANGULAR">(initial?.potShape ?? "ROUND");
  const [potDiameterInput, setPotDiameterInput] = useState(
    initial?.potDiameterMm != null ? mmToInputUnit(initial.potDiameterMm, unitSystem).toString() : "",
  );
  const [potLengthInput, setPotLengthInput] = useState(
    initial?.potLengthMm != null ? mmToInputUnit(initial.potLengthMm, unitSystem).toString() : "",
  );
  const [potWidthInput, setPotWidthInput] = useState(
    initial?.potWidthMm != null ? mmToInputUnit(initial.potWidthMm, unitSystem).toString() : "",
  );
  const [potHeightInput, setPotHeightInput] = useState(
    initial?.potHeightMm != null ? mmToInputUnit(initial.potHeightMm, unitSystem).toString() : "",
  );
  const [potMaterial, setPotMaterial] = useState(initial?.potMaterial ?? "");
  const [substrate, setSubstrate] = useState(initial?.substrate ?? "");
  const [substrateType, setSubstrateType] = useState<SubstrateType | "">(initial?.substrateType ?? "");
  const [exposure, setExposure] = useState(initial?.exposure ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [wateringEnabled, setWateringEnabled] = useState(mode === "create");
  const [wateringRecurrence, setWateringRecurrence] = useState("FIXED_INTERVAL_DAYS");
  const [wateringInterval, setWateringInterval] = useState("7");
  const [waterAmount, setWaterAmount] = useState("");
  const [waterUnit, setWaterUnit] = useState<"ml" | "L">("L");

  const [fertilizingEnabled, setFertilizingEnabled] = useState(false);
  const [fertilizingRecurrence, setFertilizingRecurrence] = useState("INTERVAL_MONTHS");
  const [fertilizingInterval, setFertilizingInterval] = useState("1");
  const [fertilizerId, setFertilizerId] = useState("");
  const [dosagePerLiter, setDosagePerLiter] = useState("");
  const [seasonalEnabled, setSeasonalEnabled] = useState(true);
  const [activeFromMonth, setActiveFromMonth] = useState("3");
  const [activeUntilMonth, setActiveUntilMonth] = useState("9");

  const [repottingEnabled, setRepottingEnabled] = useState(false);
  const [repottingRecurrence, setRepottingRecurrence] = useState("INTERVAL_MONTHS");
  const [repottingInterval, setRepottingInterval] = useState("24");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const librarySearchActive = mode === "create" && libraryQuery.trim().length >= 2 && libraryQuery !== selectedLibraryName;
  // Pas de setLibraryResults([]) quand la recherche est inactive : la liste
  // "effective" ci-dessous s'en charge au rendu plutot que par un setState
  // synchrone dans l'effet (voir WeatherSettings.tsx, meme pattern).
  const effectiveLibraryResults = librarySearchActive ? libraryResults : [];

  useEffect(() => {
    if (!librarySearchActive) return;
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/library?q=${encodeURIComponent(libraryQuery.trim())}`);
        if (res.ok) {
          setLibraryResults(await res.json());
        }
      } catch {
        // Recherche non bloquante : en cas d'échec on laisse simplement la liste vide.
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [libraryQuery, librarySearchActive]);

  /**
   * Candidat retenu depuis PlantPhotoIdentify : meme logique que
   * applyLibraryEntry si une fiche de bibliotheque locale correspond
   * exactement. Sinon, retour utilisateur (2026-09-20) : relance la
   * recherche (locale d'abord, en ligne ensuite sur clic -- meme pipeline
   * que le champ de recherche juste au-dessus) avec le nom scientifique
   * identifie, plutot que de se contenter d'un texte sans profil de soin.
   */
  function applyIdentifiedCandidate(candidate: IdentifiedCandidate) {
    if (candidate.libraryEntry) {
      applyLibraryEntry(candidate.libraryEntry as unknown as LibraryEntry);
      return;
    }
    if (!scientificName.trim()) setScientificName(candidate.scientificName);
    if (!name.trim() && candidate.commonNames[0]) setName(candidate.commonNames[0]);
    setSelectedLibraryName(null);
    setLibraryQuery(candidate.scientificName);
  }

  /**
   * Applique le profil suggere par la bibliotheque (section 20) : pre-remplit
   * les champs et les règles d'entretien encore vides, mais NE remplace
   * jamais une valeur deja saisie par l'utilisateur -- celui-ci garde
   * toujours la main.
   */
  function applyLibraryEntry(entry: LibraryEntry) {
    // entry.id absent (chaine vide) : recherche externe utilisee par un
    // compte non-admin (voir ExternalSpeciesSearch.tsx, qui n'ecrit plus
    // dans la bibliotheque partagee) -- les champs sont pre-remplis mais la
    // plante n'est liee a aucune fiche partagee, comme une plante perso.
    if (entry.id) {
      setLibraryEntryId(entry.id);
    }
    setSelectedLibraryName(entry.commonName);
    setLibraryQuery(entry.commonName);
    setLibraryResults([]);

    if (!name.trim()) setName(entry.commonName);
    if (!scientificName.trim() && entry.scientificName) setScientificName(entry.scientificName);
    if (!substrate.trim() && entry.careProfile?.substrate) setSubstrate(entry.careProfile.substrate);
    if (!exposure.trim() && entry.careProfile?.exposure) setExposure(entry.careProfile.exposure);
    if (!photoUrl && entry.careProfile?.imageUrl) setPhotoUrl(entry.careProfile.imageUrl);

    const watering = entry.careProfile?.watering;
    if (watering) {
      setWateringEnabled(true);
      setWateringRecurrence(watering.recurrenceType);
      setWateringInterval(String(watering.interval));
      if (watering.waterAmount) setWaterAmount(String(watering.waterAmount));
      if (watering.waterUnit) setWaterUnit(watering.waterUnit);
    }

    const fertilizing = entry.careProfile?.fertilizing;
    if (fertilizing) {
      setFertilizingEnabled(true);
      setFertilizingRecurrence(fertilizing.recurrenceType);
      setFertilizingInterval(String(fertilizing.interval));
      if (fertilizing.activeFromMonth != null && fertilizing.activeUntilMonth != null) {
        setSeasonalEnabled(true);
        setActiveFromMonth(String(fertilizing.activeFromMonth));
        setActiveUntilMonth(String(fertilizing.activeUntilMonth));
      } else {
        setSeasonalEnabled(false);
      }
    }

    const repotting = entry.careProfile?.repotting;
    if (repotting) {
      setRepottingEnabled(true);
      setRepottingRecurrence(repotting.recurrenceType);
      setRepottingInterval(String(repotting.interval));
    }
  }

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Téléversement impossible.");
      const data = await res.json();
      setPhotoUrl(data.url);
    } catch {
      setError("Impossible de téléverser la photo.");
    } finally {
      setUploading(false);
    }
  }

  async function createCareRule(payload: Record<string, unknown>) {
    const res = await fetch("/api/care-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Impossible de créer une règle d'entretien.");
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      let finalLocationId = locationId;
      if (locationId === "__new__") {
        if (!newLocationName.trim()) {
          throw new Error("Merci d'indiquer le nom du nouvel emplacement.");
        }
        const res = await fetch("/api/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newLocationName.trim() }),
        });
        if (!res.ok) throw new Error("Impossible de créer l'emplacement.");
        const location = await res.json();
        finalLocationId = location.id;
      }

      const plantPayload = {
        name,
        scientificName: scientificName || undefined,
        libraryEntryId: libraryEntryId || undefined,
        photoUrl: photoUrl || undefined,
        locationId: finalLocationId || undefined,
        // null (pas undefined) si aucune jardiniere n'est selectionnee : un
        // detachement volontaire doit etre envoye explicitement, sinon un
        // PATCH partiel ne toucherait jamais au rattachement existant.
        containerId: containerId || null,
        acquiredAt: acquiredAt || undefined,
        potShape,
        // null (pas undefined) sur la dimension de l'AUTRE forme : evite de
        // laisser trainer, par ex., un diametre perime une fois passe a un
        // pot rectangulaire (voir validation/plant.ts).
        potDiameterMm:
          potShape === "ROUND" ? (potDiameterInput ? inputUnitToMm(Number(potDiameterInput), unitSystem) : undefined) : null,
        potLengthMm:
          potShape === "RECTANGULAR" ? (potLengthInput ? inputUnitToMm(Number(potLengthInput), unitSystem) : undefined) : null,
        potWidthMm:
          potShape === "RECTANGULAR" ? (potWidthInput ? inputUnitToMm(Number(potWidthInput), unitSystem) : undefined) : null,
        potHeightMm: potHeightInput ? inputUnitToMm(Number(potHeightInput), unitSystem) : undefined,
        potMaterial: potMaterial || undefined,
        substrate: substrate || undefined,
        substrateType: substrateType || null,
        exposure: exposure || undefined,
        notes: notes || undefined,
      };

      let plantId = initial?.id;
      if (mode === "create") {
        const res = await fetch("/api/plants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(plantPayload),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Impossible de créer la plante.");
        }
        const plant = await res.json();
        plantId = plant.id;
      } else {
        const res = await fetch(`/api/plants/${plantId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(plantPayload),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Impossible de modifier la plante.");
        }
      }

      if (mode === "create" && plantId) {
        if (wateringEnabled) {
          await createCareRule({
            plantId,
            type: "WATERING",
            enabled: true,
            recurrenceType: wateringRecurrence,
            interval: wateringRecurrence === "MANUAL" ? undefined : Number(wateringInterval),
            configuration: {
              waterAmount: waterAmount ? Number(waterAmount) : undefined,
              waterUnit,
            },
          });
        }
        if (fertilizingEnabled) {
          await createCareRule({
            plantId,
            type: "FERTILIZING",
            enabled: true,
            recurrenceType: fertilizingRecurrence,
            interval: fertilizingRecurrence === "MANUAL" ? undefined : Number(fertilizingInterval),
            configuration: {
              fertilizerId: fertilizerId || undefined,
              dosagePerLiter: dosagePerLiter ? Number(dosagePerLiter) : undefined,
              activeFromMonth: seasonalEnabled ? Number(activeFromMonth) : undefined,
              activeUntilMonth: seasonalEnabled ? Number(activeUntilMonth) : undefined,
            },
          });
        }
        if (repottingEnabled) {
          await createCareRule({
            plantId,
            type: "REPOTTING",
            enabled: true,
            recurrenceType: repottingRecurrence,
            interval: repottingRecurrence === "MANUAL" ? undefined : Number(repottingInterval),
          });
        }
      }

      router.push(`/plantes/${plantId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  const ownWateringIntervalDays =
    mode === "create"
      ? wateringEnabled
        ? normalizeWateringIntervalDays({
            enabled: true,
            recurrenceType: wateringRecurrence,
            interval: wateringInterval ? Number(wateringInterval) : null,
          })
        : null
      : (initial?.wateringIntervalDays ?? null);

  const selectedContainer = containers.find((c) => c.id === containerId);
  // Ne bloque jamais : seulement des points d'attention, calcules en direct
  // a chaque frappe (occupants actuels de la jardiniere + cette plante-ci
  // avec ses valeurs en cours de saisie, elle-meme exclue de la comparaison
  // en mode edition).
  const compatibilityWarnings = selectedContainer
    ? checkContainerCompatibility([
        ...selectedContainer.occupants.filter((o) => o.id !== initial?.id),
        {
          id: initial?.id ?? "__self__",
          name: name.trim() || "Cette plante",
          substrateType: substrateType || null,
          wateringIntervalDays: ownWateringIntervalDays,
        } satisfies CompatibilityPlant,
      ])
    : [];

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-10">
      {error && (
        <p role="alert" className="card p-3 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {mode === "create" && (
        <section className="card p-4 space-y-2">
          <h2 className="font-semibold">Rechercher dans la bibliothèque</h2>
          <p className="text-xs text-muted">
            Optionnel : trouve ton espèce pour pré-remplir un profil de soin de départ (à ajuster librement).
          </p>
          <div className="relative">
            <input
              placeholder="Ex. Monstera, Pothos, Menthe..."
              value={libraryQuery}
              onChange={(e) => {
                setLibraryQuery(e.target.value);
                if (e.target.value !== selectedLibraryName) {
                  setLibraryEntryId(null);
                  setSelectedLibraryName(null);
                }
              }}
              className={inputClass}
            />
            {effectiveLibraryResults.length > 0 && (
              <div className="card absolute left-0 right-0 z-10 mt-1 max-h-56 overflow-y-auto p-1">
                {effectiveLibraryResults.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => applyLibraryEntry(entry)}
                    className="btn-ghost block w-full rounded-lg px-2 py-1.5 text-left text-sm"
                  >
                    <span className="font-medium">{entry.commonName}</span>
                    {entry.scientificName && <span className="text-muted italic"> · {entry.scientificName}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {libraryEntryId && (
            <p className="text-xs" style={{ color: "var(--primary-strong)" }}>
              Profil &quot;{selectedLibraryName}&quot; appliqué aux champs ci-dessous.
            </p>
          )}
          {!libraryEntryId && effectiveLibraryResults.length === 0 && libraryQuery.trim().length >= 2 && (
            <ExternalSpeciesSearch
              query={libraryQuery}
              onImported={(entry) => applyLibraryEntry(entry as unknown as LibraryEntry)}
            />
          )}
          <div className="border-t pt-2" style={{ borderColor: "var(--border)" }}>
            <p className="text-muted mb-1.5 text-xs">Ou identifie-la à partir d&apos;une photo (bêta) :</p>
            <PlantPhotoIdentify onSelect={applyIdentifiedCandidate} onPhotoUploaded={setPhotoUrl} />
          </div>
        </section>
      )}

      <section className="card p-4 space-y-4">
        <h2 className="font-semibold">Identité</h2>

        <div className="flex items-center gap-4">
          <div
            className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl"
            style={{ background: "var(--surface-alt)", color: "var(--secondary)" }}
          >
            {photoUrl ? (
              <Image src={photoUrl} alt="" fill sizes="80px" className="object-cover" unoptimized={photoUrl.startsWith("http")} />
            ) : (
              <Sprout size={28} strokeWidth={1.5} />
            )}
          </div>
          <label className="text-sm">
            <span className="btn-primary inline-block cursor-pointer rounded-xl px-3 py-2 font-semibold">
              {uploading ? "Téléversement..." : "Choisir une photo"}
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={uploading} />
          </label>
        </div>

        <div>
          <label htmlFor="name" className={labelClass}>
            Nom *
          </label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label htmlFor="scientificName" className={labelClass}>
            Nom botanique
          </label>
          <input
            id="scientificName"
            value={scientificName}
            onChange={(e) => setScientificName(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="location" className={labelClass}>
            Emplacement
          </label>
          <select id="location" value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputClass}>
            <option value="">Sans emplacement</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
            <option value="__new__">+ Nouvel emplacement...</option>
          </select>
          {locationId === "__new__" && (
            <input
              placeholder="Ex. Salon, fenêtre sud"
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              className={`${inputClass} mt-2`}
            />
          )}
        </div>

        <div>
          <label htmlFor="acquiredAt" className={labelClass}>
            Date d&apos;acquisition
          </label>
          <input
            id="acquiredAt"
            type="date"
            value={acquiredAt}
            onChange={(e) => setAcquiredAt(e.target.value)}
            className="input w-44 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="notes" className={labelClass}>
            Notes
          </label>
          <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
      </section>

      <section className="card p-4 space-y-4">
        <h2 className="font-semibold">Informations</h2>
        <div>
          <label htmlFor="containerId" className={labelClass}>
            Jardinière partagée
          </label>
          <select
            id="containerId"
            value={containerId}
            onChange={(e) => setContainerId(e.target.value)}
            className={inputClass}
          >
            <option value="">Aucune (pot individuel)</option>
            {containers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {containerId && (
            <p className="text-muted text-xs mt-1">
              Forme et dimensions du pot gérées depuis{" "}
              <Link href="/jardinieres" className="underline">
                Mes jardinières
              </Link>
              .
            </p>
          )}
          {compatibilityWarnings.length > 0 && (
            <div
              className="mt-2 space-y-1 rounded-lg px-3 py-2 text-xs"
              style={{ background: "color-mix(in srgb, var(--warning) 15%, var(--surface))", color: "var(--warning)" }}
            >
              {compatibilityWarnings.map((w) => (
                <p key={w.kind}>⚠ {w.message}</p>
              ))}
            </div>
          )}
        </div>
        {!containerId && (
        <div>
          <label htmlFor="potShape" className={labelClass}>
            Forme du pot
          </label>
          <select
            id="potShape"
            value={potShape}
            onChange={(e) => setPotShape(e.target.value as "ROUND" | "RECTANGULAR")}
            className={inputClass}
          >
            <option value="ROUND">Rond</option>
            <option value="RECTANGULAR">Rectangulaire / jardinière</option>
          </select>
        </div>
        )}
        {!containerId && (
        <div className="grid grid-cols-2 gap-3">
          {potShape === "ROUND" ? (
            <div>
              <label htmlFor="potDiameterMm" className={labelClass}>
                Diamètre du pot ({distanceUnitLabel})
              </label>
              <input
                id="potDiameterMm"
                type="number"
                min={unitSystem === "IMPERIAL" ? 0.1 : 1}
                step={unitSystem === "IMPERIAL" ? 0.1 : 1}
                value={potDiameterInput}
                onChange={(e) => setPotDiameterInput(e.target.value)}
                className={inputClass}
              />
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="potLengthMm" className={labelClass}>
                  Longueur ({distanceUnitLabel})
                </label>
                <input
                  id="potLengthMm"
                  type="number"
                  min={unitSystem === "IMPERIAL" ? 0.1 : 1}
                  step={unitSystem === "IMPERIAL" ? 0.1 : 1}
                  value={potLengthInput}
                  onChange={(e) => setPotLengthInput(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="potWidthMm" className={labelClass}>
                  Largeur ({distanceUnitLabel})
                </label>
                <input
                  id="potWidthMm"
                  type="number"
                  min={unitSystem === "IMPERIAL" ? 0.1 : 1}
                  step={unitSystem === "IMPERIAL" ? 0.1 : 1}
                  value={potWidthInput}
                  onChange={(e) => setPotWidthInput(e.target.value)}
                  className={inputClass}
                />
              </div>
            </>
          )}
          <div>
            <label htmlFor="potHeightMm" className={labelClass}>
              Hauteur du pot ({distanceUnitLabel})
            </label>
            <input
              id="potHeightMm"
              type="number"
              min={unitSystem === "IMPERIAL" ? 0.1 : 1}
              step={unitSystem === "IMPERIAL" ? 0.1 : 1}
              value={potHeightInput}
              onChange={(e) => setPotHeightInput(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        )}
        {!containerId && (
        <div>
          <label htmlFor="potMaterial" className={labelClass}>
            Matériau du pot
          </label>
          <input
            id="potMaterial"
            value={potMaterial}
            onChange={(e) => setPotMaterial(e.target.value)}
            className={inputClass}
          />
        </div>
        )}
        <div>
          <label htmlFor="substrate" className={labelClass}>
            Substrat
          </label>
          <input id="substrate" value={substrate} onChange={(e) => setSubstrate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="substrateType" className={labelClass}>
            Type de substrat
          </label>
          <select
            id="substrateType"
            value={substrateType}
            onChange={(e) => setSubstrateType(e.target.value as SubstrateType | "")}
            className={inputClass}
          >
            <option value="">Non renseigné</option>
            {SUBSTRATE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="text-muted text-xs mt-1">
            Sert uniquement à détecter des conflits évidents entre plantes d&apos;une même jardinière.
          </p>
        </div>
        <div>
          <label htmlFor="exposure" className={labelClass}>
            Exposition
          </label>
          <input id="exposure" value={exposure} onChange={(e) => setExposure(e.target.value)} className={inputClass} />
        </div>
      </section>

      {mode === "create" && (
        <>
          <section className="card p-4 space-y-4">
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={wateringEnabled} onChange={(e) => setWateringEnabled(e.target.checked)} />
              <CareTypeIcon type="WATERING" size={17} /> Arrosage
            </label>
            {wateringEnabled && (
              <div className="space-y-3 pl-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Mode</label>
                    <select
                      value={wateringRecurrence}
                      onChange={(e) => setWateringRecurrence(e.target.value)}
                      className={inputClass}
                    >
                      <option value="FIXED_INTERVAL_DAYS">Tous les X jours</option>
                      <option value="INTERVAL_WEEKS">Toutes les X semaines</option>
                      <option value="MANUAL">Manuel</option>
                    </select>
                  </div>
                  {wateringRecurrence !== "MANUAL" && (
                    <div>
                      <label className={labelClass}>Intervalle</label>
                      <input
                        type="number"
                        min={1}
                        value={wateringInterval}
                        onChange={(e) => setWateringInterval(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Quantité d&apos;eau (optionnel)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={waterAmount}
                      onChange={(e) => setWaterAmount(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Unité</label>
                    <select value={waterUnit} onChange={(e) => setWaterUnit(e.target.value as "ml" | "L")} className={inputClass}>
                      <option value="L">L</option>
                      <option value="ml">ml</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="card p-4 space-y-4">
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={fertilizingEnabled} onChange={(e) => setFertilizingEnabled(e.target.checked)} />
              <CareTypeIcon type="FERTILIZING" size={17} /> Fertilisation
            </label>
            {fertilizingEnabled && (
              <div className="space-y-3 pl-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Mode</label>
                    <select
                      value={fertilizingRecurrence}
                      onChange={(e) => setFertilizingRecurrence(e.target.value)}
                      className={inputClass}
                    >
                      <option value="INTERVAL_WEEKS">Toutes les X semaines</option>
                      <option value="INTERVAL_MONTHS">Tous les X mois</option>
                      <option value="MANUAL">Manuel</option>
                    </select>
                  </div>
                  {fertilizingRecurrence !== "MANUAL" && (
                    <div>
                      <label className={labelClass}>Intervalle</label>
                      <input
                        type="number"
                        min={1}
                        value={fertilizingInterval}
                        onChange={(e) => setFertilizingInterval(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Engrais (bibliothèque personnelle)</label>
                  <select value={fertilizerId} onChange={(e) => setFertilizerId(e.target.value)} className={inputClass}>
                    <option value="">Aucun / à définir plus tard</option>
                    {fertilizers.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  {fertilizers.length === 0 && (
                    <p className="text-muted mt-1 text-xs">Aucun engrais enregistré pour l&apos;instant -- ajoutes-en un depuis Paramètres &gt; Mes engrais.</p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Dosage (ml ou g par litre, optionnel)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={dosagePerLiter}
                    onChange={(e) => setDosagePerLiter(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={seasonalEnabled} onChange={(e) => setSeasonalEnabled(e.target.checked)} />
                  Période de fertilisation (saisonnalité)
                </label>
                {seasonalEnabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Active à partir du mois</label>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={activeFromMonth}
                        onChange={(e) => setActiveFromMonth(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Jusqu&apos;au mois</label>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={activeUntilMonth}
                        onChange={(e) => setActiveUntilMonth(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="card p-4 space-y-4">
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={repottingEnabled} onChange={(e) => setRepottingEnabled(e.target.checked)} />
              <CareTypeIcon type="REPOTTING" size={17} /> Rempotage
            </label>
            {repottingEnabled && (
              <div className="grid grid-cols-2 gap-3 pl-1">
                <div>
                  <label className={labelClass}>Mode</label>
                  <select
                    value={repottingRecurrence}
                    onChange={(e) => setRepottingRecurrence(e.target.value)}
                    className={inputClass}
                  >
                    <option value="INTERVAL_MONTHS">Tous les X mois</option>
                    <option value="MANUAL">Manuel</option>
                  </select>
                </div>
                {repottingRecurrence !== "MANUAL" && (
                  <div>
                    <label className={labelClass}>Intervalle (mois)</label>
                    <input
                      type="number"
                      min={1}
                      value={repottingInterval}
                      onChange={(e) => setRepottingInterval(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      <button type="submit" disabled={submitting} className="btn-primary w-full rounded-xl py-3 font-semibold disabled:opacity-60">
        {submitting ? "Enregistrement..." : mode === "create" ? "Ajouter la plante" : "Enregistrer"}
      </button>
    </form>
  );
}
