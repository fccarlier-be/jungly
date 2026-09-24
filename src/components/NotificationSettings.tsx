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

// Deux <select> plutot que <input type="time"> : le picker natif Android
// (TimePickerDialog du systeme) affiche son bouton de confirmation hors
// cadre sur certains appareils -- bug documente du navigateur/OS, pas
// corrigeable via notre CSS (retour utilisateur, 2026-09-22). Un menu
// deroulant HTML natif evite completement ce genre de rendu specifique a
// l'OS. Le pas de 15 minutes correspond au rythme du scheduler (voir
// scheduler.ts, qui ne verifie qu'aux quarts d'heure).
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

type SupportState = "checking" | "unsupported" | "unsupported-ios-not-installed" | "supported";

function isIosDevice(): boolean {
  // iPadOS se declare "MacIntel" mais garde le multi-touch d'un iPad.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneDisplay(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export default function NotificationSettings({
  initial,
  vapidPublicKey,
}: {
  initial: Preference;
  // Lue cote serveur au runtime (voir getVapidPublicKey), pas via
  // process.env.NEXT_PUBLIC_* qui serait fige dans l'image au build.
  vapidPublicKey: string | null;
}) {
  const [preference, setPreference] = useState<Preference>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Brouillon local pour le nombre de jours : la saisie met a jour ce champ
  // a chaque frappe sans jamais desactiver l'input (ce qui coupait le
  // focus/clavier mobile en plein milieu), et la sauvegarde reelle ne part
  // qu'au blur -- pas a chaque chiffre. L'heure n'a plus besoin de ce
  // mecanisme depuis le passage a deux <select> (choix atomique, jamais de
  // saisie partielle a preserver) : preference.notificationTime sert
  // directement de valeur affichee.
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

      const publicKey = vapidPublicKey;
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
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Heure"
                  value={preference.notificationTime.split(":")[0] ?? "08"}
                  onChange={(e) => {
                    const minutes = preference.notificationTime.split(":")[1] ?? "00";
                    savePreference({ notificationTime: `${e.target.value}:${minutes}` });
                  }}
                  disabled={saving}
                  className="input px-2 py-2 text-sm"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <span aria-hidden="true">:</span>
                <select
                  aria-label="Minutes"
                  value={preference.notificationTime.split(":")[1] ?? "00"}
                  onChange={(e) => {
                    const hours = preference.notificationTime.split(":")[0] ?? "08";
                    savePreference({ notificationTime: `${hours}:${e.target.value}` });
                  }}
                  disabled={saving}
                  className="input px-2 py-2 text-sm"
                >
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-muted mt-1 text-xs">Le digest est envoyé pile à cette heure.</p>
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
