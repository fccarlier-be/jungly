import { CareDisc, hasCareDisc } from "@/components/art/paper";
import { Droplets, Sprout, Shovel, Scissors, Search, FileText, type LucideIcon } from "@/components/icons";

export type CareType = "WATERING" | "FERTILIZING" | "REPOTTING" | "PRUNING" | "INSPECTION" | "OTHER";

export const CARE_ICON: Record<CareType, LucideIcon> = {
  WATERING: Droplets,
  FERTILIZING: Sprout,
  REPOTTING: Shovel,
  PRUNING: Scissors,
  INSPECTION: Search,
  OTHER: FileText,
};

/** Une couleur distincte par type de soin, pour reperer un pictogramme au coup d'oeil. */
export const CARE_COLOR: Record<CareType, string> = {
  WATERING: "var(--care-watering)",
  FERTILIZING: "var(--care-fertilizing)",
  REPOTTING: "var(--care-repotting)",
  PRUNING: "var(--care-pruning)",
  INSPECTION: "var(--care-inspection)",
  OTHER: "var(--care-inspection)",
};

/** Fond teinte assorti a la couleur du type de soin, pour les pastilles/avatars d'icone. */
export function careSoftBackground(type: string): string {
  const key = (type in CARE_COLOR ? type : "OTHER") as CareType;
  return `color-mix(in srgb, ${CARE_COLOR[key]} 16%, transparent)`;
}

export function CareTypeIcon({
  type,
  size = 18,
  className,
  colored = true,
}: {
  type: string;
  size?: number;
  className?: string;
  /** Passe a false pour heriter la couleur du parent (ex. dans un badge deja colore). */
  colored?: boolean;
}) {
  const key = (type in CARE_ICON ? type : "OTHER") as CareType;
  const Icon = CARE_ICON[key];
  return (
    <Icon
      size={size}
      className={className}
      strokeWidth={2}
      style={{
        ...(colored ? { color: CARE_COLOR[key] } : undefined),
        // Force une couche de composition dediee pour ce SVG : sans ca, un
        // bug connu de rasterisation GPU sur certains Android/Chrome affiche
        // les traits arrondis (stroke-linecap round) a petite taille comme
        // une suite de points au lieu d'un trait continu -- reproduit sur
        // tablette, absent en emulation desktop. transform + backface-
        // visibility forcent un chemin de rendu different qui evite le bug.
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
      }}
    />
  );
}

/**
 * Pastille de soin : la version papier decoupe pour arroser/fertiliser/
 * rempoter/tailler, un rond teinte avec l'icone pour les autres types.
 */
export function CareAvatar({ type, size = 36, className }: { type: string; size?: number; className?: string }) {
  if (hasCareDisc(type)) return <CareDisc type={type} size={size} className={className} />;
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full ${className ?? ""}`}
      style={{ width: size, height: size, background: careSoftBackground(type) }}
    >
      <CareTypeIcon type={type} size={Math.round(size * 0.5)} />
    </div>
  );
}
