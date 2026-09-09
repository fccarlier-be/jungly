"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Sprout } from "lucide-react";
import { CareTypeIcon } from "@/components/careIcons";
import ExternalSpeciesSearch, { type ImportedLibraryEntry } from "@/components/ExternalSpeciesSearch";

export interface LocationOption {
  id: string;
  name: string;
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
  acquiredAt?: string | Date | null;
  potDiameterMm?: number | null;
  potHeightMm?: number | null;
  potMaterial?: string | null;
  substrate?: string | null;
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
  fertilizers,
}: {
  mode: "create" | "edit";
  initial?: PlantFormInitial;
  locations: LocationOption[];
  fertilizers: FertilizerOption[];
}) {
  const router = useRouter();

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
  const [acquiredAt, setAcquiredAt] = useState(toDateInputValue(initial?.acquiredAt));
  const [potDiameterMm, setPotDiameterMm] = useState(initial?.potDiameterMm?.toString() ?? "");
  const [potHeightMm, setPotHeightMm] = useState(initial?.potHeightMm?.toString() ?? "");
  const [potMaterial, setPotMaterial] = useState(initial?.potMaterial ?? "");
  const [substrate, setSubstrate] = useState(initial?.substrate ?? "");
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

  useEffect(() => {
    if (mode !== "create" || libraryQuery.trim().length < 2 || libraryQuery === selectedLibraryName) {
      setLibraryResults([]);
      return;
    }
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
  }, [libraryQuery, mode, selectedLibraryName]);

  /**
   * Applique le profil suggere par la bibliotheque (section 20) : pre-remplit
   * les champs et les règles d'entretien encore vides, mais NE remplace
   * jamais une valeur deja saisie par l'utilisateur -- celui-ci garde
   * toujours la main.
   */
  function applyLibraryEntry(entry: LibraryEntry) {
    setLibraryEntryId(entry.id);
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
    await fetch("/api/care-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
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
        acquiredAt: acquiredAt || undefined,
        potDiameterMm: potDiameterMm ? Number(potDiameterMm) : undefined,
        potHeightMm: potHeightMm ? Number(potHeightMm) : undefined,
        potMaterial: potMaterial || undefined,
        substrate: substrate || undefined,
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
            {libraryResults.length > 0 && (
              <div className="card absolute left-0 right-0 z-10 mt-1 max-h-56 overflow-y-auto p-1">
                {libraryResults.map((entry) => (
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
          {!libraryEntryId && libraryResults.length === 0 && libraryQuery.trim().length >= 2 && (
            <ExternalSpeciesSearch
              query={libraryQuery}
              onImported={(entry) => applyLibraryEntry(entry as unknown as LibraryEntry)}
            />
          )}
        </section>
      )}

      <section className="card p-4 space-y-4">
        <h2 className="font-semibold">Identité</h2>

        <div className="flex items-center gap-4">
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl"
            style={{ background: "var(--surface-alt)", color: "var(--secondary)" }}
          >
            {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : <Sprout size={28} strokeWidth={1.5} />}
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="potDiameterMm" className={labelClass}>
              Diamètre du pot (mm)
            </label>
            <input
              id="potDiameterMm"
              type="number"
              min={1}
              value={potDiameterMm}
              onChange={(e) => setPotDiameterMm(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="potHeightMm" className={labelClass}>
              Hauteur du pot (mm)
            </label>
            <input
              id="potHeightMm"
              type="number"
              min={1}
              value={potHeightMm}
              onChange={(e) => setPotHeightMm(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
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
        <div>
          <label htmlFor="substrate" className={labelClass}>
            Substrat
          </label>
          <input id="substrate" value={substrate} onChange={(e) => setSubstrate(e.target.value)} className={inputClass} />
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
