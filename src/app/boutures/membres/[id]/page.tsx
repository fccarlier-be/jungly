import Link from "next/link";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { requireSessionUserId } from "@/lib/session";
import { getCuttingsBanUntil } from "@/server/cuttings/access";
import { listUnacknowledgedWarnings } from "@/server/cuttings/moderation";
import SuspensionScreen from "@/components/SuspensionScreen";
import { isCuttingsMarketplaceEnabled } from "@/lib/features";
import { NotFoundError } from "@/lib/errors";
import { getMemberProfile } from "@/server/cuttings/service";
import ReputationBadge from "@/components/ReputationBadge";

/** Profil PUBLIC d'un membre : pseudo, moyenne, commentaires recus -- jamais son nom reel ni son email. */
export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  if (!isCuttingsMarketplaceEnabled()) {
    notFound();
  }
  const userId = await requireSessionUserId();
  const banUntil = await getCuttingsBanUntil(userId);
  if (banUntil) {
    return <SuspensionScreen until={banUntil} warnings={await listUnacknowledgedWarnings(userId)} />;
  }
  const { id } = await params;

  let profile;
  try {
    profile = await getMemberProfile(id);
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

      <section className="card space-y-2 p-4">
        <h1 className="font-display text-2xl font-semibold">{profile.pseudo ?? "Membre sans pseudo"}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <ReputationBadge reputation={profile.reputation} />
          <span className="text-muted">
            {profile.transactionCount} échange{profile.transactionCount > 1 ? "s" : ""} réalisé{profile.transactionCount > 1 ? "s" : ""}
          </span>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Notes reçues</h2>
        {profile.ratings.length === 0 ? (
          <p className="text-muted text-sm">Aucune note pour l&apos;instant.</p>
        ) : (
          <div className="space-y-2.5">
            {profile.ratings.map((r) => (
              <div key={r.id} className="card space-y-1 p-3.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} size={14} fill={n <= r.score ? "var(--warning)" : "none"} stroke="var(--warning)" />
                    ))}
                  </span>
                  <span className="text-muted text-xs">{new Date(r.createdAt).toLocaleDateString("fr-BE")}</span>
                </div>
                {r.comment && <p>{r.comment}</p>}
                <p className="text-muted text-xs">
                  par {r.raterPseudo ?? "un membre"} · {r.listingTitle}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
