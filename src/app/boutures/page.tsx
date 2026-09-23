import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { requireSessionUserId } from "@/lib/session";
import { isCuttingsMarketplaceEnabled } from "@/lib/features";
import { listOpenListings, listMyListings, listConversationListings, countUnreadMessages, markCuttingsSeen } from "@/server/cuttings/service";
import { getPseudo } from "@/server/cuttings/pseudo";
import CuttingListingCard from "@/components/CuttingListingCard";
import PseudoForm from "@/components/PseudoForm";

const TABS = [
  { value: "toutes", label: "Toutes les annonces" },
  { value: "mine", label: "Mes annonces" },
  { value: "messages", label: "Messages" },
] as const;

const EMPTY_MESSAGE: Record<string, string> = {
  toutes: "Aucune annonce ouverte pour l'instant.",
  mine: "Tu n'as publié aucune annonce pour l'instant.",
  messages: "Aucune conversation pour l'instant.",
};

export default async function BouturesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  if (!isCuttingsMarketplaceEnabled()) {
    notFound();
  }
  const userId = await requireSessionUserId();
  const { tab: requestedTab = "toutes" } = await searchParams;
  const tab = TABS.some((t) => t.value === requestedTab) ? requestedTab : "toutes";

  // Arriver sur cette page vaut acquittement de la banniere d'accueil --
  // meme raisonnement qu'un clic sur "Voir" (voir CuttingsBanner.tsx),
  // couvre aussi le cas ou l'utilisateur y accede par un autre chemin
  // (Outils).
  await markCuttingsSeen(userId);

  const [pseudo, unreadTotal] = await Promise.all([getPseudo(userId), countUnreadMessages(userId)]);
  const listings =
    tab === "mine" ? await listMyListings(userId) : tab === "messages" ? await listConversationListings(userId) : await listOpenListings();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Boutures</h1>
        {pseudo && (
          <Link href="/boutures/nouvelle" className="btn-primary flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold">
            <Plus size={16} />
            Publier
          </Link>
        )}
      </div>

      <PseudoForm initialPseudo={pseudo} required={!pseudo} />

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link key={t.value} href={`/boutures?tab=${t.value}`} className={`chip rounded-full px-3.5 py-1.5 text-sm ${tab === t.value ? "chip-active" : ""}`}>
            {t.label}
            {t.value === "messages" && unreadTotal > 0 && (
              <span className="ml-1.5 rounded-full px-1.5 text-xs font-bold" style={{ background: "var(--accent)", color: "var(--accent-ink, #fff)" }}>
                {unreadTotal}
              </span>
            )}
          </Link>
        ))}
      </div>

      {listings.length === 0 ? (
        <p className="text-muted py-8 text-center">{EMPTY_MESSAGE[tab]}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {listings.map((listing) => (
            <CuttingListingCard key={listing.id} listing={listing} showStatus={tab !== "toutes"} />
          ))}
        </div>
      )}
    </div>
  );
}
