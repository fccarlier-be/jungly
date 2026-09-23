import { notFound } from "next/navigation";
import { requireSessionUserId } from "@/lib/session";
import { isCuttingsMarketplaceEnabled } from "@/lib/features";
import CuttingListingForm from "@/components/CuttingListingForm";

export default async function NewCuttingListingPage() {
  if (!isCuttingsMarketplaceEnabled()) {
    notFound();
  }
  await requireSessionUserId();

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold">Publier une bouture</h1>
      <CuttingListingForm />
    </div>
  );
}
