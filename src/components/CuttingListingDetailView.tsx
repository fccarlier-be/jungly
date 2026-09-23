"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, Star } from "lucide-react";
import { bypassesImageOptimizer } from "@/lib/imageOptimization";
import {
  CUTTING_LISTING_TYPE_LABEL,
  CUTTING_LISTING_STATUS_LABEL,
  CUTTING_RATING_MIN,
  CUTTING_RATING_MAX,
  type CuttingListingType,
  type CuttingListingStatus,
} from "@/server/cuttings/types";
import type { CuttingListingDetail } from "@/server/cuttings/service";
import PlantPhotoLightbox from "@/components/PlantPhotoLightbox";
import PseudoForm from "@/components/PseudoForm";

const NO_PSEUDO = "membre sans pseudo";

export default function CuttingListingDetailView({
  listing,
  currentUserId,
  myPseudo,
}: {
  listing: CuttingListingDetail;
  currentUserId: string;
  myPseudo: string | null;
}) {
  const router = useRouter();
  const isOwner = currentUserId === listing.owner.id;

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Par defaut : la conversation avec des messages non lus en priorite (les
  // participants arrivent tries par activite recente), sinon la plus recente.
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(
    (listing.participants.find((p) => p.unreadCount > 0) ?? listing.participants[0])?.id ?? null,
  );
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherPartyId = isOwner ? selectedParticipantId : listing.owner.id;
  const selectedParticipant = listing.participants.find((p) => p.id === selectedParticipantId) ?? null;
  const otherPartyPseudo = (isOwner ? selectedParticipant?.pseudo : listing.owner.pseudo) ?? NO_PSEUDO;
  const unreadInOpenThread = isOwner ? (selectedParticipant?.unreadCount ?? 0) : listing.unreadFromOwner;

  const thread = useMemo(
    () => listing.messages.filter((m) => otherPartyId && (m.senderId === otherPartyId || m.recipientId === otherPartyId)),
    [listing.messages, otherPartyId],
  );

  // Ouvrir un fil suffit a le marquer lu -- sans ca, le compteur de la
  // banniere d'accueil ne redescendrait jamais.
  useEffect(() => {
    if (!otherPartyId || unreadInOpenThread === 0) return;
    fetch(`/api/cuttings/${listing.id}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ withUserId: otherPartyId }),
    })
      .then(() => router.refresh())
      .catch(() => {});
  }, [listing.id, otherPartyId, unreadInOpenThread, router]);

  const canMessage = listing.status !== "ANNULEE" && (!isOwner || otherPartyId != null);
  const isCompletedParticipant = listing.status === "TERMINEE" && (currentUserId === listing.owner.id || currentUserId === listing.completedWithUserId);
  const counterpartPseudo = isOwner
    ? (listing.participants.find((p) => p.id === listing.completedWithUserId)?.pseudo ?? NO_PSEUDO)
    : (listing.owner.pseudo ?? NO_PSEUDO);

  async function sendMessage() {
    if (!otherPartyId || !messageBody.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/cuttings/${listing.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: otherPartyId, body: messageBody.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Envoi impossible.");
      setMessageBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSending(false);
    }
  }

  async function cancelListing() {
    if (!confirm("Annuler cette annonce ?")) return;
    setActionPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/cuttings/${listing.id}/cancel`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Action impossible.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setActionPending(false);
    }
  }

  async function completeWith(userId: string, pseudo: string) {
    if (!confirm(`Marquer cette annonce comme terminée avec ${pseudo} ?`)) return;
    setActionPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/cuttings/${listing.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedWithUserId: userId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Action impossible.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setActionPending(false);
    }
  }

  async function submitRating() {
    setRatingSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cuttings/${listing.id}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: ratingScore, comment: ratingComment || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Envoi impossible.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setRatingSubmitting(false);
    }
  }

  const type = listing.type as CuttingListingType;
  const status = listing.status as CuttingListingStatus;

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          {listing.photoUrls.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="relative h-20 w-20 overflow-hidden rounded-lg"
              style={{ background: "var(--surface-alt)" }}
            >
              <Image src={url} alt="" fill sizes="80px" className="object-cover" unoptimized={bypassesImageOptimizer(url)} />
            </button>
          ))}
        </div>

        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="font-display text-xl font-semibold">{listing.title}</h1>
            {listing.species && <p className="text-muted text-sm italic">{listing.species}</p>}
          </div>
          <div className="flex shrink-0 gap-1.5">
            <span className="badge badge-today">{CUTTING_LISTING_TYPE_LABEL[type]}</span>
            <span
              className="badge"
              style={{
                background:
                  status === "OUVERTE"
                    ? "color-mix(in srgb, var(--secondary) 18%, transparent)"
                    : status === "ANNULEE"
                      ? "color-mix(in srgb, var(--danger) 16%, transparent)"
                      : "color-mix(in srgb, var(--accent) 16%, transparent)",
                color: status === "OUVERTE" ? "var(--primary-strong)" : status === "ANNULEE" ? "var(--danger)" : "var(--accent)",
              }}
            >
              {CUTTING_LISTING_STATUS_LABEL[status]}
            </span>
          </div>
        </div>

        {listing.description && <p className="text-sm leading-relaxed">{listing.description}</p>}
        <p className="text-muted text-xs">
          Publiée par <strong style={{ color: "var(--ink)" }}>{isOwner ? "toi" : (listing.owner.pseudo ?? NO_PSEUDO)}</strong>
        </p>

        {isOwner && status === "OUVERTE" && (
          <button
            type="button"
            onClick={cancelListing}
            disabled={actionPending}
            className="btn-ghost rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
          >
            Annuler l&apos;annonce
          </button>
        )}
      </section>

      {status === "TERMINEE" && (
        <section className="card space-y-3 p-4 text-sm">
          <h2 className="font-semibold">Échange terminé avec {counterpartPseudo}</h2>
          {isCompletedParticipant ? (
            listing.myRating ? (
              <p className="text-muted">Ta note : {listing.myRating.score}/5{listing.myRating.comment ? ` — ${listing.myRating.comment}` : ""}</p>
            ) : (
              <div className="space-y-2">
                <p className="text-muted">Comment s&apos;est passé cet échange avec {counterpartPseudo} ?</p>
                <div className="flex gap-1">
                  {Array.from({ length: CUTTING_RATING_MAX - CUTTING_RATING_MIN + 1 }, (_, i) => i + CUTTING_RATING_MIN).map((n) => (
                    <button key={n} type="button" onClick={() => setRatingScore(n)} aria-label={`${n} étoile(s)`}>
                      <Star size={22} fill={n <= ratingScore ? "var(--warning)" : "none"} stroke="var(--warning)" />
                    </button>
                  ))}
                </div>
                <textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="État de la bouture, conformité avec les photos, conseils reçus..."
                  className="input w-full"
                />
                <button
                  type="button"
                  onClick={submitRating}
                  disabled={ratingSubmitting}
                  className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {ratingSubmitting ? "Envoi..." : "Envoyer ma note"}
                </button>
              </div>
            )
          ) : null}
          {listing.counterpartRating && (
            <p className="text-muted">
              Note reçue de {counterpartPseudo} : {listing.counterpartRating.score}/5
              {listing.counterpartRating.comment ? ` — ${listing.counterpartRating.comment}` : ""}
            </p>
          )}
        </section>
      )}

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Messages</h2>

        {isOwner && listing.participants.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-muted text-xs">
              {listing.participants.length} personne{listing.participants.length > 1 ? "s ont" : " a"} écrit sur cette annonce :
            </p>
            <div className="flex flex-wrap gap-2">
              {listing.participants.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedParticipantId(p.id)}
                  className={`chip flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${selectedParticipantId === p.id ? "chip-active" : ""}`}
                >
                  {p.pseudo ?? NO_PSEUDO}
                  {p.unreadCount > 0 && (
                    <span className="rounded-full px-1.5 text-xs font-bold" style={{ background: "var(--accent)", color: "var(--accent-ink, #fff)" }}>
                      {p.unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {isOwner && status === "OUVERTE" && selectedParticipant && (
          <button
            type="button"
            onClick={() => completeWith(selectedParticipant.id, selectedParticipant.pseudo ?? NO_PSEUDO)}
            disabled={actionPending}
            className="btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
          >
            Marquer terminé avec {selectedParticipant.pseudo ?? NO_PSEUDO}
          </button>
        )}

        {isOwner && listing.participants.length === 0 ? (
          <p className="text-muted text-sm">Aucun message pour l&apos;instant.</p>
        ) : (
          <div className="space-y-2">
            {otherPartyId && <p className="text-muted text-xs">Conversation avec <strong style={{ color: "var(--ink)" }}>{otherPartyPseudo}</strong></p>}
            {thread.map((m) => {
              const mine = m.senderId === currentUserId;
              return (
                <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <span className="text-muted mb-0.5 px-1 text-[11px]">{mine ? "Moi" : (m.senderPseudo ?? NO_PSEUDO)}</span>
                  <div
                    className="max-w-[80%] rounded-2xl px-3 py-2 text-sm"
                    style={mine ? { background: "var(--primary)", color: "var(--primary-ink)" } : { background: "var(--surface-alt)" }}
                  >
                    {m.body}
                  </div>
                </div>
              );
            })}
            {thread.length === 0 && !isOwner && <p className="text-muted text-sm">Envoie un premier message à {otherPartyPseudo} pour te manifester.</p>}
          </div>
        )}

        {canMessage &&
          (myPseudo ? (
            <div className="flex gap-2">
              <input
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                maxLength={2000}
                placeholder={`Écrire à ${otherPartyPseudo}...`}
                className="input flex-1"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={sending || !messageBody.trim()}
                className="btn-primary shrink-0 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : "Envoyer"}
              </button>
            </div>
          ) : (
            <PseudoForm initialPseudo={null} required />
          ))}
      </section>

      {lightboxIndex !== null && (
        <PlantPhotoLightbox photos={listing.photoUrls} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </div>
  );
}
