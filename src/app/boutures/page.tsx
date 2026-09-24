import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, Plus } from "@/components/icons";
import { requireSessionUserId } from "@/lib/session";
import { getCuttingsBanUntil } from "@/server/cuttings/access";
import { listUnacknowledgedWarnings } from "@/server/cuttings/moderation";
import SuspensionScreen from "@/components/SuspensionScreen";
import { isCuttingsMarketplaceEnabled } from "@/lib/features";
import {
  listOpenListings,
  listMyListings,
  listConversationListings,
  listMyTransactions,
  countUnreadMessages,
  countRatingsToGive,
  markCuttingsSeen,
} from "@/server/cuttings/service";
import { CUTTINGS_NO_SALE_RULE } from "@/server/cuttings/types";
import { getPseudo } from "@/server/cuttings/pseudo";
import CuttingListingCard from "@/components/CuttingListingCard";
import PseudoForm from "@/components/PseudoForm";
import WarningCards from "@/components/WarningCards";
import CuttingTransactionList from "@/components/CuttingTransactionList";

const TABS = [
  { value: "toutes", label: "Toutes les annonces" },
  { value: "mine", label: "Mes annonces" },
  { value: "messages", label: "Messages" },
  { value: "echanges", label: "Échanges" },
] as const;

const EMPTY_MESSAGE: Record<string, string> = {
  toutes: "Aucune annonce ouverte pour l'instant.",
  mine: "Tu n'as publié aucune annonce pour l'instant.",
  messages: "Aucune conversation pour l'instant.",
  echanges: "Aucun échange réalisé pour l'instant.",
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
  const banUntil = await getCuttingsBanUntil(userId);
  if (banUntil) {
    return <SuspensionScreen until={banUntil} warnings={await listUnacknowledgedWarnings(userId)} />;
  }
  const { tab: requestedTab = "toutes" } = await searchParams;
  const tab = TABS.some((t) => t.value === requestedTab) ? requestedTab : "toutes";

  // Arriver sur cette page vaut acquittement de la banniere d'accueil --
  // meme raisonnement qu'un clic sur "Voir" (voir CuttingsBanner.tsx),
  // couvre aussi le cas ou l'utilisateur y accede par un autre chemin
  // (Outils).
  await markCuttingsSeen(userId);

  const [pseudo, unreadTotal, ratingsToGive, warnings] = await Promise.all([
    getPseudo(userId),
    countUnreadMessages(userId),
    countRatingsToGive(userId),
    listUnacknowledgedWarnings(userId),
  ]);
  const transactions = tab === "echanges" ? await listMyTransactions(userId) : [];
  const listings =
    tab === "echanges"
      ? []
      : tab === "mine"
        ? await listMyListings(userId)
        : tab === "messages"
          ? await listConversationListings(userId)
          : await listOpenListings();

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

      {warnings.length > 0 && <WarningCards warnings={warnings} />}

      <PseudoForm initialPseudo={pseudo} required={!pseudo} />

      <p className="flex gap-2 rounded-lg p-3 text-sm" style={{ background: "color-mix(in srgb, var(--warning) 14%, transparent)" }}>
        <Ban size={18} className="mt-0.5 shrink-0" style={{ color: "var(--warning)" }} aria-hidden />
        <span>
          {CUTTINGS_NO_SALE_RULE} Un membre qui propose de vendre ? Utilise le bouton « Signaler » dans la conversation.
        </span>
      </p>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link key={t.value} href={`/boutures?tab=${t.value}`} className={`chip rounded-full px-3.5 py-1.5 text-sm ${tab === t.value ? "chip-active" : ""}`}>
            {t.label}
            {((t.value === "messages" && unreadTotal > 0) || (t.value === "echanges" && ratingsToGive > 0)) && (
              <span className="ml-1.5 rounded-full px-1.5 text-xs font-bold" style={{ background: "var(--accent)", color: "var(--accent-ink, #fff)" }}>
                {t.value === "messages" ? unreadTotal : ratingsToGive}
              </span>
            )}
          </Link>
        ))}
      </div>

      {tab === "echanges" ? (
        transactions.length === 0 ? (
          <p className="text-muted py-8 text-center">{EMPTY_MESSAGE[tab]}</p>
        ) : (
          <CuttingTransactionList transactions={transactions} />
        )
      ) : listings.length === 0 ? (
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
