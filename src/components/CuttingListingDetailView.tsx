"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Ban, Flag, Loader2 } from "@/components/icons";
import { bypassesImageOptimizer } from "@/lib/imageOptimization";
import {
  CUTTING_LISTING_TYPE_LABEL,
  CUTTING_LISTING_STATUS_LABEL,
  CUTTINGS_NO_SALE_RULE,
  type CuttingListingType,
  type CuttingListingStatus,
} from "@/server/cuttings/types";
import type { CuttingListingDetail } from "@/server/cuttings/service";
import PlantPhotoLightbox from "@/components/PlantPhotoLightbox";
import PseudoForm from "@/components/PseudoForm";
import ReputationBadge from "@/components/ReputationBadge";
import RecordTransactionDialog from "@/components/RecordTransactionDialog";
import ReportDialog from "@/components/ReportDialog";
import CuttingTransactionList from "@/components/CuttingTransactionList";

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
  const [confirmingTransaction, setConfirmingTransaction] = useState(false);
  const [reporting, setReporting] = useState(false);
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
  const canRecordTransaction = isOwner && listing.status === "OUVERTE" && listing.remaining > 0 && selectedParticipant !== null;

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
    const hasTransactions = listing.transactions.length > 0;
    if (!confirm(hasTransactions ? "Retirer ce qu'il reste de cette annonce ? Les échanges déjà enregistrés ne changent pas." : "Annuler cette annonce ?")) return;
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

  async function recordTransaction(quantity: number) {
    if (!selectedParticipant) return;
    setActionPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/cuttings/${listing.id}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: selectedParticipant.id, quantity }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Action impossible.");
      setConfirmingTransaction(false);
      router.refresh();
    } catch (err) {
      setConfirmingTransaction(false);
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setActionPending(false);
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

        <p className="text-sm font-medium" style={{ color: "var(--primary-strong)" }}>
          {listing.remaining === 0
            ? `Plus de boutures (${listing.quantity} proposée${listing.quantity > 1 ? "s" : ""} au total)`
            : listing.quantity === 1
              ? "1 bouture proposée"
              : `${listing.remaining} bouture${listing.remaining > 1 ? "s" : ""} restante${listing.remaining > 1 ? "s" : ""} sur ${listing.quantity}`}
        </p>

        {listing.description && <p className="text-sm leading-relaxed">{listing.description}</p>}
        <p className="text-muted flex flex-wrap items-center gap-2 text-xs">
          <span>
            Publiée par{" "}
            {isOwner ? (
              <strong style={{ color: "var(--ink)" }}>toi</strong>
            ) : (
              <Link href={`/boutures/membres/${listing.owner.id}`} className="font-semibold underline underline-offset-2" style={{ color: "var(--ink)" }}>
                {listing.owner.pseudo ?? NO_PSEUDO}
              </Link>
            )}
          </span>
          <ReputationBadge reputation={listing.owner.reputation} />
        </p>

        {isOwner && status === "OUVERTE" && (
          <button
            type="button"
            onClick={cancelListing}
            disabled={actionPending}
            className="btn-ghost rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
          >
            {listing.transactions.length > 0 ? "Retirer le reste de l'annonce" : "Annuler l'annonce"}
          </button>
        )}
      </section>

      {listing.transactions.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">{isOwner ? "Échanges réalisés" : "Ton échange"}</h2>
          <CuttingTransactionList transactions={listing.transactions} showListingLink={false} />
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

        {canRecordTransaction && selectedParticipant && (
          <button
            type="button"
            onClick={() => setConfirmingTransaction(true)}
            disabled={actionPending}
            className="btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
          >
            Enregistrer un échange avec {selectedParticipant.pseudo ?? NO_PSEUDO}
          </button>
        )}

        {isOwner && listing.participants.length === 0 ? (
          <p className="text-muted text-sm">Aucun message pour l&apos;instant.</p>
        ) : (
          <div className="space-y-2">
            {otherPartyId && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-muted text-xs">
                  Conversation avec{" "}
                  <Link href={`/boutures/membres/${otherPartyId}`} className="font-semibold underline underline-offset-2" style={{ color: "var(--ink)" }}>
                    {otherPartyPseudo}
                  </Link>
                </p>
                <ReputationBadge reputation={isOwner ? selectedParticipant?.reputation : listing.owner.reputation} />
                <button type="button" onClick={() => setReporting(true)} className="text-muted flex items-center gap-1 text-xs underline underline-offset-2">
                  <Flag size={12} />
                  Signaler
                </button>
              </div>
            )}
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
            <div className="space-y-1.5">
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
              <p className="text-muted flex items-start gap-1.5 text-xs">
                <Ban size={12} className="mt-0.5 shrink-0" aria-hidden />
                {CUTTINGS_NO_SALE_RULE} Un membre qui propose de vendre ? Signale-le.
              </p>
            </div>
          ) : (
            <PseudoForm initialPseudo={null} required />
          ))}
      </section>

      {confirmingTransaction && selectedParticipant && (
        <RecordTransactionDialog
          recipientPseudo={selectedParticipant.pseudo ?? NO_PSEUDO}
          max={listing.remaining}
          pending={actionPending}
          onConfirm={recordTransaction}
          onCancel={() => setConfirmingTransaction(false)}
        />
      )}

      {reporting && otherPartyId && (
        <ReportDialog listingId={listing.id} reportedUserId={otherPartyId} reportedPseudo={otherPartyPseudo} onClose={() => setReporting(false)} />
      )}

      {lightboxIndex !== null && (
        <PlantPhotoLightbox photos={listing.photoUrls} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </div>
  );
}
