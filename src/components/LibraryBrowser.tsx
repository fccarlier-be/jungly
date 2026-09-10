"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Sprout, Sun, Thermometer, Droplets, Layers, Tag, ShieldAlert, Gauge, type LucideIcon } from "lucide-react";
import { CARE_ICON, CARE_COLOR } from "@/components/careIcons";
import ExternalSpeciesSearch from "@/components/ExternalSpeciesSearch";

interface CareProfile {
  imageUrl?: string;
  exposure?: string;
  temperatureRange?: string;
  humidity?: string;
  substrate?: string;
  toxicity?: string;
  careLevel?: string;
  tips?: string;
  watering?: { recurrenceType: string; interval: number; waterAmount?: number; waterUnit?: string };
  fertilizing?: { recurrenceType: string; interval: number; activeFromMonth?: number; activeUntilMonth?: number };
  repotting?: { recurrenceType: string; interval: number };
}

export interface LibraryEntryData {
  id: string;
  commonName: string;
  scientificName: string | null;
  family: string | null;
  careProfile: CareProfile | null;
}

const RECURRENCE_LABEL: Record<string, string> = {
  FIXED_INTERVAL_DAYS: "jours",
  INTERVAL_WEEKS: "semaines",
  INTERVAL_MONTHS: "mois",
};

function formatRecurrence(r?: { recurrenceType: string; interval: number }): string | null {
  if (!r) return null;
  return `tous les ${r.interval} ${RECURRENCE_LABEL[r.recurrenceType] ?? r.recurrenceType}`;
}

export default function LibraryBrowser() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibraryEntryData[]>([]);
  const [searching, setSearching] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [browsing, setBrowsing] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [browseError, setBrowseError] = useState<string | null>(null);

  const isSearchMode = query.trim().length >= 2;

  useEffect(() => {
    if (isSearchMode) return;
    setBrowsing(true);
    setBrowseError(null);
    setOpenId(null);
    fetch(`/api/library/browse?page=${page}`)
      .then((res) => {
        if (!res.ok) throw new Error("browse-failed");
        return res.json();
      })
      .then((body) => {
        setResults(body.entries ?? []);
        setTotalPages(body.totalPages ?? 1);
      })
      .catch(() => setBrowseError("Impossible de charger la bibliothèque."))
      .finally(() => setBrowsing(false));
  }, [page, isSearchMode]);

  useEffect(() => {
    if (!isSearchMode) return;
    setOpenId(null);
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/library?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) setResults(await res.json());
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, isSearchMode]);

  return (
    <div className="space-y-3">
      <input
        placeholder="Rechercher une plante (ex. Monstera, Aloe vera, Basilic...)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        className="input w-full px-3 py-2 text-sm"
      />

      {browseError && !isSearchMode && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {browseError}
        </p>
      )}

      {isSearchMode && !searching && results.length === 0 && (
        <div className="space-y-2">
          <p className="text-muted text-sm">Aucun résultat dans ta bibliothèque locale.</p>
          <ExternalSpeciesSearch query={query} onImported={() => router.refresh()} />
        </div>
      )}

      <div className="space-y-2">
        {results.map((entry) => {
          const open = openId === entry.id;
          const profile = entry.careProfile;
          return (
            <div key={entry.id} className="card p-3 text-sm">
              <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpenId(open ? null : entry.id)}>
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                  style={{ background: "var(--surface-alt)", color: "var(--secondary)" }}
                >
                  {profile?.imageUrl ? (
                    <img src={profile.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Sprout size={22} strokeWidth={1.5} />
                  )}
                </div>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{entry.commonName}</span>
                  {entry.scientificName && <span className="text-muted block italic">{entry.scientificName}</span>}
                </span>
                <ChevronDown size={18} className="text-muted shrink-0 transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }} />
              </button>

              {open && profile && (
                <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                  {profile.imageUrl && (
                    <img src={profile.imageUrl} alt={entry.commonName} className="mb-1 h-40 w-full rounded-xl object-cover" />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {entry.family && <Tile icon={Tag} label="Famille" value={entry.family} />}
                    <Tile icon={Sun} label="Exposition" value={profile.exposure} />
                    <Tile icon={Thermometer} label="Température" value={profile.temperatureRange} />
                    <Tile icon={Droplets} label="Humidité" value={profile.humidity} />
                    <Tile icon={Layers} label="Substrat" value={profile.substrate} />
                    <Tile icon={CARE_ICON.WATERING} iconColor={CARE_COLOR.WATERING} label="Arrosage" value={formatRecurrence(profile.watering)} />
                    <Tile icon={CARE_ICON.FERTILIZING} iconColor={CARE_COLOR.FERTILIZING} label="Fertilisation" value={formatRecurrence(profile.fertilizing)} />
                    <Tile icon={CARE_ICON.REPOTTING} iconColor={CARE_COLOR.REPOTTING} label="Rempotage" value={formatRecurrence(profile.repotting)} />
                    {profile.toxicity && <Tile icon={ShieldAlert} label="Toxicité" value={profile.toxicity} />}
                    {profile.careLevel && <Tile icon={Gauge} label="Niveau d'entretien" value={profile.careLevel} />}
                  </div>
                  {profile.tips && <p className="text-muted pt-1 text-xs italic">{profile.tips}</p>}
                  <p className="text-muted pt-2 text-xs">
                    Valeurs à titre indicatif -- les besoins réels dépendent du climat, du substrat, de la taille du pot et de la
                    saison. Utilisables comme point de départ lors de l&apos;ajout d&apos;une plante.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isSearchMode && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || browsing}
            className="chip flex items-center gap-1 rounded-full px-3 py-1.5 text-sm disabled:opacity-40"
          >
            <ChevronLeft size={15} />
            Précédent
          </button>
          <span className="text-muted text-sm">
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || browsing}
            className="chip flex items-center gap-1 rounded-full px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Suivant
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function Tile({
  icon: Icon,
  iconColor,
  label,
  value,
}: {
  icon: LucideIcon;
  iconColor?: string;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="rounded-xl p-2.5" style={{ background: "var(--surface-alt)" }}>
      <p className="text-muted flex items-center gap-1.5 text-xs">
        <Icon size={13} style={iconColor ? { color: iconColor } : undefined} />
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium leading-snug">{value}</p>
    </div>
  );
}
