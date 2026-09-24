import Link from "next/link";
import Image from "next/image";
import { bypassesImageOptimizer } from "@/lib/imageOptimization";
import ReputationBadge from "@/components/ReputationBadge";
import type { Reputation } from "@/server/cuttings/service";
import { CUTTING_LISTING_TYPE_LABEL, CUTTING_LISTING_STATUS_LABEL, type CuttingListingType, type CuttingListingStatus } from "@/server/cuttings/types";
import { PlantPlaceholder } from "@/components/art/paper";

export interface CuttingListingCardData {
  id: string;
  title: string;
  species: string | null;
  type: string;
  status: string;
  photoUrls: string[];
  owner: { id: string; pseudo: string | null; reputation?: Reputation };
  quantity: number;
  remaining: number;
  unreadCount?: number;
}

const STATUS_BADGE_CLASS: Record<CuttingListingStatus, string> = {
  OUVERTE: "badge-healthy",
  RESERVEE: "badge-watch",
  TERMINEE: "badge-today",
  ANNULEE: "badge-attention",
};

export default function CuttingListingCard({ listing, showStatus = false }: { listing: CuttingListingCardData; showStatus?: boolean }) {
  const image = listing.photoUrls[0] ?? null;
  const type = listing.type as CuttingListingType;
  const status = listing.status as CuttingListingStatus;

  return (
    <Link href={`/boutures/${listing.id}`} className="card group block overflow-hidden">
      <div className="relative aspect-square w-full overflow-hidden" style={{ background: "var(--surface-alt)" }}>
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized={bypassesImageOptimizer(image)}
          />
        ) : (
          <PlantPlaceholder className="h-full w-full" />
        )}
        {(listing.unreadCount ?? 0) > 0 && (
          <span
            className="absolute right-2.5 top-2.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold"
            style={{ background: "var(--accent)", color: "var(--accent-ink, #fff)" }}
            aria-label={`${listing.unreadCount} message(s) non lu(s)`}
          >
            {listing.unreadCount}
          </span>
        )}
        <span className={`badge absolute left-2.5 top-2.5 ${showStatus ? STATUS_BADGE_CLASS[status] : "badge-today"}`} style={{ background: "var(--surface)" }}>
          {showStatus ? CUTTING_LISTING_STATUS_LABEL[status] : CUTTING_LISTING_TYPE_LABEL[type]}
        </span>
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate font-medium leading-tight">{listing.title}</p>
        {listing.species && <p className="text-muted truncate text-xs italic">{listing.species}</p>}
        <p className="text-muted flex items-center gap-1.5 text-xs">
          <span className="truncate">par {listing.owner.pseudo ?? "membre sans pseudo"}</span>
          <ReputationBadge reputation={listing.owner.reputation} />
        </p>
        <p className="text-xs font-medium" style={{ color: "var(--primary-strong)" }}>
          {listing.remaining === 0
            ? "Plus de boutures"
            : listing.quantity === 1
              ? "1 bouture"
              : `${listing.remaining} bouture${listing.remaining > 1 ? "s" : ""} restante${listing.remaining > 1 ? "s" : ""} sur ${listing.quantity}`}
        </p>
      </div>
    </Link>
  );
}
