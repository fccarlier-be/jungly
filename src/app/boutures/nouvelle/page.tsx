import { notFound } from "next/navigation";
import { requireSessionUserId } from "@/lib/session";
import { getCuttingsBanUntil } from "@/server/cuttings/access";
import { listUnacknowledgedWarnings } from "@/server/cuttings/moderation";
import SuspensionScreen from "@/components/SuspensionScreen";
import { isCuttingsMarketplaceEnabled } from "@/lib/features";
import { getPseudo } from "@/server/cuttings/pseudo";
import CuttingListingForm from "@/components/CuttingListingForm";
import PseudoForm from "@/components/PseudoForm";

export default async function NewCuttingListingPage() {
  if (!isCuttingsMarketplaceEnabled()) {
    notFound();
  }
  const userId = await requireSessionUserId();
  const banUntil = await getCuttingsBanUntil(userId);
  if (banUntil) {
    return <SuspensionScreen until={banUntil} warnings={await listUnacknowledgedWarnings(userId)} />;
  }
  const pseudo = await getPseudo(userId);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold">Publier une bouture</h1>
      {pseudo ? <CuttingListingForm /> : <PseudoForm initialPseudo={null} required />}
    </div>
  );
}
