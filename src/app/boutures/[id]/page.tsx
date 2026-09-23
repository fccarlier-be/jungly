import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSessionUserId } from "@/lib/session";
import { getCuttingsBanUntil } from "@/server/cuttings/access";
import { listUnacknowledgedWarnings } from "@/server/cuttings/moderation";
import SuspensionScreen from "@/components/SuspensionScreen";
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
  const banUntil = await getCuttingsBanUntil(userId);
  if (banUntil) {
    return <SuspensionScreen until={banUntil} warnings={await listUnacknowledgedWarnings(userId)} />;
  }
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
