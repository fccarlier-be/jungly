"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Check } from "@/components/icons";
import { PlantPlaceholder } from "@/components/art/paper";

type Watering = { recurrenceType: string; interval: number };

interface LibraryEntry {
  id: string;
  commonName: string;
  scientificName: string | null;
  careProfile: { watering?: Watering } | null;
}

const FREQUENCIES = [
  { label: "Tous les 3 jours", interval: 3 },
  { label: "Toutes les semaines", interval: 7 },
  { label: "Toutes les 2 semaines", interval: 14 },
  { label: "Une fois par mois", interval: 30 },
];

/** Meme libelle que LibraryBrowser.formatRecurrence(), pour un rendu coherent. */
function wateringLabel(watering: Watering | null | undefined) {
  if (!watering) return null;
  const { recurrenceType, interval } = watering;
  if (recurrenceType === "FIXED_INTERVAL_DAYS") return `Tous les ${interval} jours`;
  if (recurrenceType === "INTERVAL_WEEKS") return interval === 1 ? "Toutes les semaines" : `Toutes les ${interval} semaines`;
  if (recurrenceType === "INTERVAL_MONTHS") return interval === 1 ? "Une fois par mois" : `Tous les ${interval} mois`;
  return null;
}

/**
 * Ajout guide de la toute premiere plante d'un compte (voir OnboardingTour) :
 * deux ecrans courts plutot que le formulaire complet (PlantForm, tous les
 * champs) qui reste disponible ensuite pour completer la fiche. Cree la
 * plante puis, si possible, une seule regle d'arrosage.
 */
export default function GuidedFirstPlantForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibraryEntry[]>([]);
  const [selected, setSelected] = useState<LibraryEntry | null>(null);
  const [intervalDays, setIntervalDays] = useState<number | null>(7);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pas de setResults([]) quand la recherche est inactive : la liste
  // "effective" ci-dessous s'en charge au rendu plutot que par un setState
  // synchrone dans l'effet (meme pattern que PlantForm.tsx).
  const searchActive = !selected && query.trim().length >= 2;
  const effectiveResults = searchActive ? results : [];

  useEffect(() => {
    if (!searchActive) return;
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/library?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) setResults(await res.json());
      } catch {
        // Recherche non bloquante : en cas d'echec on laisse simplement la liste vide.
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, searchActive]);

  function pick(entry: LibraryEntry) {
    setSelected(entry);
    setQuery(entry.commonName);
    setResults([]);
    if (!name.trim()) setName(entry.commonName);
  }

  function clearSelection() {
    setSelected(null);
    setQuery("");
  }

  const libraryWatering = selected?.careProfile?.watering ?? null;
  const libraryWateringLabel = wateringLabel(libraryWatering);

  async function createPlant() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/plants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scientificName: selected?.scientificName ?? undefined,
          libraryEntryId: selected?.id,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Impossible de créer cette plante.");
        setSaving(false);
        return;
      }
      const plant = await res.json();

      // Une seule regle d'arrosage, best-effort : reprise de la bibliotheque si
      // elle en propose une, sinon la frequence choisie a l'ecran 2 (ou
      // aucune si l'utilisateur a prefere "je reglerai ca plus tard").
      const rule = libraryWatering
        ? { recurrenceType: libraryWatering.recurrenceType, interval: libraryWatering.interval }
        : intervalDays
          ? { recurrenceType: "FIXED_INTERVAL_DAYS", interval: intervalDays }
          : null;
      if (rule) {
        await fetch("/api/care-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plantId: plant.id, type: "WATERING", enabled: true, ...rule }),
        }).catch(() => {
          // Best-effort : la plante existe deja, on ne bloque pas dessus.
        });
      }

      router.push(`/plantes/${plant.id}`);
      router.refresh();
    } catch {
      setError("Erreur inattendue.");
      setSaving(false);
    }
  }

  if (step === 1) {
    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <label htmlFor="guided-plant-name" className="text-sm font-medium">
            Comment s&apos;appelle ta plante ?
          </label>
          <input
            id="guided-plant-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ma Monstera, le ficus du salon..."
            className="input w-full px-3 py-2.5"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="guided-plant-species" className="text-sm font-medium">
            Une espèce dans notre bibliothèque ? <span className="text-muted font-normal">(facultatif)</span>
          </label>
          <p className="text-muted text-xs">
            En trouver une préremplit automatiquement l&apos;arrosage à l&apos;étape suivante.
          </p>
          <div className="relative">
            <Search size={16} className="text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="guided-plant-species"
              value={query}
              onChange={(e) => {
                setSelected(null);
                setQuery(e.target.value);
              }}
              placeholder="Monstera deliciosa, pothos..."
              className="input w-full py-2.5 pl-9 pr-3"
            />
          </div>
          {selected && (
            <div className="chip-active flex items-center justify-between rounded-xl px-3 py-2 text-sm">
              <span>
                {selected.commonName}
                {selected.scientificName && <span className="italic opacity-80"> · {selected.scientificName}</span>}
              </span>
              <button type="button" onClick={clearSelection} className="font-semibold underline">
                Changer
              </button>
            </div>
          )}
          {!selected && effectiveResults.length > 0 && (
            <div className="card max-h-56 space-y-0.5 overflow-y-auto p-1.5">
              {effectiveResults.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => pick(entry)}
                  className="btn-ghost block w-full rounded-lg px-2.5 py-2 text-left text-sm"
                >
                  {entry.commonName}
                  {entry.scientificName && <span className="text-muted italic"> · {entry.scientificName}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setStep(2)}
          disabled={!name.trim()}
          className="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          Continuer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="card flex items-center gap-3 p-3">
        <PlantPlaceholder className="h-14 w-14 shrink-0 overflow-hidden rounded-xl" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{name}</p>
          {selected?.scientificName && <p className="text-muted truncate text-xs italic">{selected.scientificName}</p>}
        </div>
      </div>

      {libraryWateringLabel ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">Arrosage</p>
          <p className="text-muted text-sm">
            Repris de la fiche {selected?.commonName} : <strong className="text-ink font-semibold">{libraryWateringLabel}</strong>.
            Modifiable ensuite sur la fiche de la plante.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">À quel rythme comptes-tu l&apos;arroser ?</p>
          <div className="grid grid-cols-2 gap-2">
            {FREQUENCIES.map((f) => (
              <button
                key={f.interval}
                type="button"
                onClick={() => setIntervalDays(f.interval)}
                className={`rounded-xl border px-3 py-2.5 text-left text-sm ${intervalDays === f.interval ? "chip-active" : "chip"}`}
              >
                {intervalDays === f.interval && <Check size={13} className="mr-1 inline -translate-y-px" />}
                {f.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setIntervalDays(null)} className="text-muted text-xs underline">
            Je réglerai ça plus tard
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={() => setStep(1)} className="chip rounded-xl px-4 py-2.5 text-sm font-medium">
          Précédent
        </button>
        <button
          type="button"
          onClick={createPlant}
          disabled={saving}
          className="btn-primary flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          {saving ? "Création..." : "Créer ma plante"}
        </button>
      </div>
    </div>
  );
}
