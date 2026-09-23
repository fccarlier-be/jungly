import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSessionUserId } from "@/lib/session";
import { isCuttingsMarketplaceEnabled } from "@/lib/features";
import { getListingDetail } from "@/server/cuttings/service";
import { getPseudo } from "@/server/cuttings/pseudo";
import { NotFoundError } from "@/lib/errors";
import CuttingListingDetailView from "@/components/CuttingListingDetailView";

export default async function CuttingListingPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isCuttingsMarketplaceEnabled()) {
    notFound();
  }
  const userId = await requireSessionUserId();
  const { id } = await params;

  const myPseudo = await getPseudo(userId);
  let listing;
  try {
    listing = await getListingDetail(id, userId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="space-y-5">
      <Link href="/boutures" className="text-sm font-medium" style={{ color: "var(--primary-strong)" }}>
        ← Retour aux boutures
      </Link>
      <CuttingListingDetailView listing={listing} currentUserId={userId} myPseudo={myPseudo} />
    </div>
  );
}
