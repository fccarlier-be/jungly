/**
 * Hook officiel Next.js exécuté une fois au démarrage du serveur (voir
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation).
 * Sert ici à démarrer le scheduler de notifications en mémoire, sans
 * dépendre d'un cron côté hôte.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startNotificationScheduler } = await import("@/server/notifications/scheduler");
    startNotificationScheduler();
  }
}
