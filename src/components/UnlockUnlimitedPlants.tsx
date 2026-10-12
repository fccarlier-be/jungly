"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sprout, Loader2, CheckCircle2 } from "@/components/icons";
import { purchaseHostedUnlimited } from "@/lib/playBilling";

/**
 * Deblocage du palier gratuit (voir server/planLimit.ts) -- utilise a deux
 * endroits : en plein ecran quand la creation d'une plante est bloquee
 * (PlanLimitError, voir PlantForm.tsx/GuidedFirstPlantForm.tsx), et en
 * encart dans Parametres, accessible a tout moment meme sous la limite.
 *
 * L'achat ne marche que dans l'app Android (voir lib/playBilling.ts) :
 * "indisponible" n'est jamais une erreur, juste expliquee comme telle.
 */
export default function UnlockUnlimitedPlants({
  productId,
  limit,
  variant = "inline",
  onUnlocked,
}: {
  productId: string;
  limit: number;
  variant?: "inline" | "blocking";
  onUnlocked?: () => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "purchasing" | "verifying" | "unavailable" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function unlock() {
    setStatus("purchasing");
    setError(null);

    const outcome = await purchaseHostedUnlimited(productId);
    if (outcome.status === "cancelled") {
      setStatus("idle");
      return;
    }
    if (outcome.status === "unavailable") {
      setStatus("unavailable");
      return;
    }
    if (outcome.status === "error") {
      setError(outcome.message);
      setStatus("error");
      return;
    }

    setStatus("verifying");
    try {
      const res = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseToken: outcome.purchaseToken, productId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Achat effectué, mais la vérification a échoué. Contacte-nous si ça persiste.");
        setStatus("error");
        return;
      }
      router.refresh();
      onUnlocked?.();
    } catch {
      setError("Achat effectué, mais la vérification a échoué. Contacte-nous si ça persiste.");
      setStatus("error");
    }
  }

  const busy = status === "purchasing" || status === "verifying";

  return (
    <div className={variant === "blocking" ? "card space-y-3 p-5 text-center" : "space-y-2"}>
      {variant === "blocking" && (
        <div className="icon-disc mx-auto flex h-12 w-12 items-center justify-center rounded-full">
          <Sprout size={22} />
        </div>
      )}
      <p className={variant === "blocking" ? "font-display text-lg font-semibold" : "text-sm font-medium"}>
        {variant === "blocking" ? `Tu as atteint ${limit} plantes` : "Jungly illimité"}
      </p>
      <p className="text-muted text-sm">
        {variant === "blocking"
          ? `L'offre gratuite s'arrête à ${limit} plantes. Débloque Jungly illimité, un seul paiement, à vie.`
          : `Gratuit jusqu'à ${limit} plantes. Débloque l'illimité en un seul paiement, jamais d'abonnement.`}
      </p>

      {status === "unavailable" && (
        <p className="text-sm" style={{ color: "var(--warning)" }}>
          Le déblocage n&apos;est possible que depuis l&apos;app Android Jungly, pas depuis un navigateur.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={unlock}
        disabled={busy}
        className="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {busy ? (
          <Loader2 size={16} className="mx-auto animate-spin" />
        ) : (
          "Débloquer Jungly illimité"
        )}
      </button>
    </div>
  );
}

/** Puce "déjà débloqué" (Parametres), pour ne pas reproposer l'achat. */
export function UnlimitedUnlocked() {
  return (
    <div className="chip-active flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm">
      <CheckCircle2 size={16} />
      Jungly illimité débloqué
    </div>
  );
}
