/**
 * Suivi reel du quota Pl@ntNet, journalier, PROPRE A CETTE INSTANCE (voir
 * PlantnetDailyUsage dans prisma/schema.prisma). Avant cette table, le
 * "quota partage entre plantes-app et plantes-app-hosted" n'existait que
 * dans un message d'erreur -- aucun compteur reel (audit du 2026-09-22).
 * La vraie correction recommandee est une cle Pl@ntNet SEPAREE par
 * instance (voir docker-compose.yml) : ce compteur protege alors le vrai
 * plafond gratuit (500/jour, verifie sur my.plantnet.org/pricing) de CETTE
 * seule instance, sans aucune coordination inter-conteneurs necessaire.
 */
import { db } from "@/server/db";

// Marge sous les 500/jour reels : laisse de la place a l'usage deja engage
// dans la journee avant de bloquer, plutot que de taper pile le mur et
// risquer un vrai 429 Pl@ntNet en pleine requete utilisateur.
const DAILY_SOFT_CAP = 480;

/** Date du jour au fuseau du serveur (TZ=Europe/Brussels, voir docker-compose.yml), format YYYY-MM-DD. */
function todayKey(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
}

export async function getPlantnetUsageToday(): Promise<{ count: number; softCap: number }> {
  const row = await db.plantnetDailyUsage.findUnique({ where: { date: todayKey() } });
  return { count: row?.count ?? 0, softCap: DAILY_SOFT_CAP };
}

/**
 * A verifier AVANT tout appel reel a Pl@ntNet (identify ou
 * diseases/identify) -- c'est le vrai garde-fou, `incrementPlantnetUsage`
 * ne fait qu'enregistrer un fait apres coup.
 */
export async function isPlantnetQuotaAvailable(): Promise<boolean> {
  const { count, softCap } = await getPlantnetUsageToday();
  return count < softCap;
}

/**
 * A appeler apres CHAQUE requete HTTP reellement envoyee a Pl@ntNet, quel
 * que soit son resultat (succes, "espece non reconnue", ou erreur cote
 * Pl@ntNet) -- depuis le 2026-02-13, Pl@ntNet facture aussi les requetes
 * en erreur en plan gratuit (verifie sur leur changelog officiel). Ne pas
 * appeler si `fetch` lui-meme a echoue avant d'atteindre Pl@ntNet (aucun
 * credit reellement consomme dans ce cas).
 */
export async function incrementPlantnetUsage(): Promise<void> {
  const date = todayKey();
  await db.plantnetDailyUsage.upsert({
    where: { date },
    create: { date, count: 1 },
    update: { count: { increment: 1 } },
  });
}
