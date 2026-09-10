"use client";

import { useEffect, useState } from "react";
import { urlBase64ToUint8Array } from "@/lib/push";

interface Preference {
  enabled: boolean;
  notificationTime: string;
  overdueEnabled: boolean;
  advanceReminderDays: number;
}

const inputClass = "input w-full px-3 py-2 text-sm";

type SupportState = "checking" | "unsupported" | "unsupported-ios-not-installed" | "supported";

/** Arrondit au quart d'heure le plus proche (le scheduler ne verifie qu'a ces instants, voir scheduler.ts). */
function roundToQuarterHour(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;
  const totalMinutes = (Math.round((hours * 60 + minutes) / 15) * 15) % (24 * 60);
  const roundedHours = Math.floor(totalMinutes / 60);
  const roundedMinutes = totalMinutes % 60;
  return `${String(roundedHours).padStart(2, "0")}:${String(roundedMinutes).padStart(2, "0")}`;
}

function isIosDevice(): boolean {
  // iPadOS se declare "MacIntel" mais garde le multi-touch d'un iPad.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneDisplay(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export default function NotificationSettings({ initial }: { initial: Preference }) {
  const [preference, setPreference] = useState<Preference>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Brouillons locaux pour l'heure et le nombre de jours : la saisie met a
  // jour ces champs a chaque frappe sans jamais desactiver l'input (ce qui
  // coupait le focus/clavier mobile en plein milieu), et la sauvegarde reelle
  // ne part qu'au blur -- pas a chaque tick de la roulette ou chaque chiffre.
  const [timeDraft, setTimeDraft] = useState(initial.notificationTime);
  const [daysDraft, setDaysDraft] = useState(String(initial.advanceReminderDays));

  const [support, setSupport] = useState<SupportState>("checking");
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    async function checkSupport() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        // Sur iOS/iPadOS, PushManager n'existe que pour une PWA installée
        // (ajoutée à l'écran d'accueil) ET ouverte depuis cette icône --
        // jamais depuis un onglet Safari classique, même à jour. On
        // distingue ce cas pour donner une marche à suivre plutôt qu'un
        // simple "non supporté" qui laisserait l'utilisateur bloqué.
        setSupport(isIosDevice() && !isStandaloneDisplay() ? "unsupported-ios-not-installed" : "unsupported");
        return;
      }
      setSupport("supported");
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        setSubscribed(Boolean(existing));
      } catch {
        // Ignore : l'état "abonné" restera simplement inconnu/false.
      }
    }
    checkSupport();
  }, []);

  async function savePreference(next: Partial<Preference>) {
    const previous = preference;
    const merged = { ...preference, ...next };
    setPreference(merged);
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        // Revert : sans ca, l'interface affichait un reglage "enregistre"
        // alors que le serveur l'avait refuse (ex. heure invalide).
        setPreference(previous);
        setMessage("Impossible d'enregistrer ce réglage.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function subscribe() {
    setSubscribing(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("Permission refusée par le navigateur.");
        return;
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setMessage("Configuration serveur incomplète (clé VAPID manquante).");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const json = subscription.toJSON();
      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) {
        // L'abonnement navigateur existe mais le serveur ne le connait pas :
        // annoncer un succes ici aurait laisse croire a des notifications
        // actives qui ne partiraient jamais.
        await subscription.unsubscribe();
        setMessage("Impossible d'enregistrer l'abonnement sur le serveur.");
        return;
      }

      setSubscribed(true);
      if (!preference.enabled) {
        await savePreference({ enabled: true });
      }
      setMessage("Notifications activées sur cet appareil.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible d'activer les notifications.");
    } finally {
      setSubscribing(false);
    }
  }

  async function unsubscribe() {
    setSubscribing(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        const res = await fetch("/api/notifications/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
        if (!res.ok) {
          // Desabonnement navigateur deja effectif malgre l'echec serveur :
          // le signaler plutot que de pretendre que tout s'est bien passe.
          setMessage("Désabonné sur cet appareil, mais le serveur n'a pas pu être mis à jour.");
          setSubscribed(false);
          return;
        }
      }
      setSubscribed(false);
      setMessage("Notifications désactivées sur cet appareil.");
    } finally {
      setSubscribing(false);
    }
  }

  async function sendTest() {
    setMessage(null);
    const res = await fetch("/api/notifications/test", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Notification de test envoyée." : (body.error ?? "Échec de l'envoi."));
  }

  return (
    <div className="space-y-4">
      {message && support !== "supported" && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {message}
        </p>
      )}

      {support === "unsupported" && (
        <p className="text-sm text-muted">Les notifications push ne sont pas supportées par ce navigateur.</p>
      )}

      {support === "unsupported-ios-not-installed" && (
        <div className="text-sm text-muted space-y-2">
          <p>Sur iPhone/iPad, les notifications ne fonctionnent que si l&apos;appli est ajoutée à l&apos;écran d&apos;accueil (jamais depuis un onglet Safari).</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Appuie sur l&apos;icône de partage en bas de Safari</li>
            <li>Choisis &laquo; Sur l&apos;écran d&apos;accueil &raquo;</li>
            <li>Ouvre l&apos;appli depuis cette nouvelle icône (pas depuis Safari)</li>
            <li>Reviens dans Paramètres pour activer les notifications</li>
          </ol>
        </div>
      )}

      {support === "supported" && (
        <div className="space-y-2">
          {subscribed ? (
            <button onClick={unsubscribe} disabled={subscribing} className="chip w-full rounded-xl py-2.5 text-sm font-medium">
              Désactiver sur cet appareil
            </button>
          ) : (
            <button
              onClick={subscribe}
              disabled={subscribing}
              className="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {subscribing ? "..." : "Activer les notifications sur cet appareil"}
            </button>
          )}
          {subscribed && (
            <button onClick={sendTest} className="chip w-full rounded-xl py-2 text-sm">
              Envoyer une notification de test
            </button>
          )}
          {message && <p className="text-sm text-muted">{message}</p>}
        </div>
      )}

      <div className="space-y-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
        <label className="flex items-center justify-between text-sm">
          <span>Digest quotidien activé</span>
          <input
            type="checkbox"
            checked={preference.enabled}
            onChange={(e) => savePreference({ enabled: e.target.checked })}
            disabled={saving}
          />
        </label>

        {preference.enabled && (
          <>
            <div>
              <label className="text-sm font-medium block mb-1">Heure d&apos;envoi</label>
              <input
                type="time"
                step={900}
                value={timeDraft}
                onChange={(e) => setTimeDraft(e.target.value)}
                onBlur={() => {
                  if (!timeDraft) return;
                  const rounded = roundToQuarterHour(timeDraft);
                  setTimeDraft(rounded);
                  if (rounded !== preference.notificationTime) {
                    savePreference({ notificationTime: rounded });
                  }
                }}
                className="input w-32 px-3 py-2 text-sm"
              />
              <p className="text-muted mt-1 text-xs">
                Le digest est envoyé pile à cette heure (arrondie au quart d&apos;heure le plus proche).
              </p>
            </div>

            <label className="flex items-center justify-between text-sm">
              <span>Signaler les tâches en retard</span>
              <input
                type="checkbox"
                checked={preference.overdueEnabled}
                onChange={(e) => savePreference({ overdueEnabled: e.target.checked })}
                disabled={saving}
              />
            </label>

            <div>
              <label className="text-sm font-medium block mb-1">Rappel anticipé (jours avant l&apos;échéance, 0 = désactivé)</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={30}
                value={daysDraft}
                onChange={(e) => setDaysDraft(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={() => {
                  const parsed = Math.min(30, Math.max(0, Number(daysDraft)));
                  const value = Number.isFinite(parsed) ? parsed : preference.advanceReminderDays;
                  setDaysDraft(String(value));
                  if (value !== preference.advanceReminderDays) {
                    savePreference({ advanceReminderDays: value });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className={inputClass}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
