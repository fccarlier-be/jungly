import Link from "next/link";
import { Star } from "lucide-react";
import type { CuttingTransactionData } from "@/server/cuttings/service";
import ReputationBadge from "@/components/ReputationBadge";
import RatingForm from "@/components/RatingForm";

const NO_PSEUDO = "membre sans pseudo";

function Stars({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={13} fill={n <= score ? "var(--warning)" : "none"} stroke="var(--warning)" />
      ))}
    </span>
  );
}

/**
 * Echanges REALISES avec, pour chacun, la note donnee et la note recue -- ou
 * le formulaire pour noter si ce n'est pas encore fait. C'est ici (onglet
 * "Échanges" et fiche de l'annonce) que les notes apparaissent, en plus de
 * la moyenne affichee a cote de chaque pseudo et du profil du membre.
 */
export default function CuttingTransactionList({
  transactions,
  showListingLink = true,
}: {
  transactions: CuttingTransactionData[];
  showListingLink?: boolean;
}) {
  return (
    <div className="space-y-3">
      {transactions.map((t) => {
        const pseudo = t.counterpart.pseudo ?? NO_PSEUDO;
        return (
          <div key={t.id} className="card space-y-2 p-4 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">
                {t.quantity} bouture{t.quantity > 1 ? "s" : ""} {t.iAmOwner ? "remise" : "reçue"}
                {t.quantity > 1 ? "s" : ""} {t.iAmOwner ? "à" : "de"}{" "}
                <Link href={`/boutures/membres/${t.counterpart.id}`} className="underline underline-offset-2">
                  {pseudo}
                </Link>
              </p>
              <span className="text-muted shrink-0 text-xs">{new Date(t.createdAt).toLocaleDateString("fr-BE")}</span>
            </div>
            <div className="text-muted flex flex-wrap items-center gap-2 text-xs">
              <ReputationBadge reputation={t.counterpart.reputation} />
              {showListingLink && (
                <Link href={`/boutures/${t.listingId}`} className="underline underline-offset-2">
                  {t.listingTitle}
                </Link>
              )}
            </div>

            {t.myRating ? (
              <p>
                Ta note : <Stars score={t.myRating.score} />
                {t.myRating.comment ? <span className="text-muted"> — {t.myRating.comment}</span> : null}
              </p>
            ) : (
              <RatingForm transactionId={t.id} counterpartPseudo={pseudo} />
            )}

            {t.counterpartRating ? (
              <p>
                Note reçue de {pseudo} : <Stars score={t.counterpartRating.score} />
                {t.counterpartRating.comment ? <span className="text-muted"> — {t.counterpartRating.comment}</span> : null}
              </p>
            ) : (
              t.myRating && <p className="text-muted text-xs">{pseudo} n&apos;a pas encore laissé sa note.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
