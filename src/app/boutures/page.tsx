import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { requireSessionUserId } from "@/lib/session";
import { isCuttingsMarketplaceEnabled } from "@/lib/features";
import { listOpenListings, listMyListings, markCuttingsSeen } from "@/server/cuttings/service";
import CuttingListingCard from "@/components/CuttingListingCard";

export default async function BouturesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  if (!isCuttingsMarketplaceEnabled()) {
    notFound();
  }
  const userId = await requireSessionUserId();
  const { tab = "toutes" } = await searchParams;

  // Arriver sur cette page vaut acquittement de la banniere d'accueil --
  // meme raisonnement qu'un clic sur "Voir" (voir CuttingsBanner.tsx),
  // couvre aussi le cas ou l'utilisateur y accede par un autre chemin
  // (Outils).
  await markCuttingsSeen(userId);

  const listings = tab === "mine" ? await listMyListings(userId) : await listOpenListings();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Boutures</h1>
        <Link href="/boutures/nouvelle" className="btn-primary flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold">
          <Plus size={16} />
          Publier
        </Link>
      </div>

      <div className="flex gap-2">
        <Link href="/boutures?tab=toutes" className={`chip rounded-full px-3.5 py-1.5 text-sm ${tab === "toutes" ? "chip-active" : ""}`}>
          Toutes les annonces
        </Link>
        <Link href="/boutures?tab=mine" className={`chip rounded-full px-3.5 py-1.5 text-sm ${tab === "mine" ? "chip-active" : ""}`}>
          Mes annonces
        </Link>
      </div>

      {listings.length === 0 ? (
        <p className="text-muted py-8 text-center">
          {tab === "mine" ? "Tu n'as publié aucune annonce pour l'instant." : "Aucune annonce ouverte pour l'instant."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {listings.map((listing) => (
            <CuttingListingCard key={listing.id} listing={listing} showStatus={tab === "mine"} />
          ))}
        </div>
      )}
    </div>
  );
}
