import Link from "next/link";
import Image from "next/image";
import { Leaf } from "lucide-react";
import { bypassesImageOptimizer } from "@/lib/imageOptimization";
import { CUTTING_LISTING_TYPE_LABEL, CUTTING_LISTING_STATUS_LABEL, type CuttingListingType, type CuttingListingStatus } from "@/server/cuttings/types";

export interface CuttingListingCardData {
  id: string;
  title: string;
  species: string | null;
  type: string;
  status: string;
  photoUrls: string[];
  owner: { id: string; name: string | null };
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
          <div className="flex h-full w-full items-center justify-center" style={{ color: "var(--secondary)" }}>
            <Leaf size={40} strokeWidth={1.5} />
          </div>
        )}
        <span className={`badge absolute left-2.5 top-2.5 ${showStatus ? STATUS_BADGE_CLASS[status] : "badge-today"}`} style={{ background: "var(--surface)" }}>
          {showStatus ? CUTTING_LISTING_STATUS_LABEL[status] : CUTTING_LISTING_TYPE_LABEL[type]}
        </span>
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate font-medium leading-tight">{listing.title}</p>
        {listing.species && <p className="text-muted truncate text-xs italic">{listing.species}</p>}
        <p className="text-muted truncate text-xs">{listing.owner.name ?? "Un membre"}</p>
      </div>
    </Link>
  );
}
