import { HEALTH_LABEL, type HealthLevel } from "@/lib/plantHealth";

/**
 * Carte de partage d'une plante (image + texte d'accompagnement), pour
 * WhatsApp/Messenger/Facebook/Instagram via le menu de partage natif. Pur :
 * utilise par la route qui dessine l'image (src/server/shareCard/) comme par
 * la page de partage cote client (texte par defaut modifiable).
 */

export const SHARE_FORMATS = ["square", "story"] as const;
export type ShareFormat = (typeof SHARE_FORMATS)[number];

export const SHARE_MODES = ["single", "beforeAfter"] as const;
export type ShareMode = (typeof SHARE_MODES)[number];

// Tailles natives des publications carrees et des stories (Instagram,
// Facebook, statut WhatsApp) : pas de recadrage par l'appli cible.
export const CARD_SIZE: Record<ShareFormat, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};

export const FORMAT_LABEL: Record<ShareFormat, string> = {
  square: "Carré",
  story: "Story",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

/**
 * Duree lisible entre deux dates, arrondie a l'unite la plus parlante :
 * "3 jours", "5 semaines", "8 mois", "1 an et 3 mois". Jamais negative.
 */
export function formatElapsed(from: Date, to: Date): string {
  const days = Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
  if (days < 1) return "moins d'un jour";
  if (days < 14) return plural(days, "jour");
  if (days < 60) return plural(Math.floor(days / 7), "semaine");

  // Mois calendaires plutot que days/30 : "8 mois" doit correspondre a ce
  // que l'utilisateur compte lui-meme sur un calendrier.
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  months = Math.max(1, months);
  if (months < 12) return `${months} mois`;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? plural(years, "an") : `${plural(years, "an")} et ${rest} mois`;
}

export interface ShareStats {
  // Arrivee dans la collection (acquiredAt, sinon date de creation de la fiche).
  since: Date;
  waterings: number;
  fertilizings: number;
  healthLevel: HealthLevel | null;
}

export interface ShareTextInput extends ShareStats {
  name: string;
  scientificName: string | null;
  mode: ShareMode;
  // Mode avant/apres : dates des deux photos choisies.
  beforeDate?: Date;
  afterDate?: Date;
  now?: Date;
}

/**
 * Texte d'accompagnement par defaut (modifiable par l'utilisateur avant
 * partage). Sans emoji ni hashtag imposes : c'est le texte de l'utilisateur,
 * l'appli ne fait que proposer un point de depart.
 */
export function buildDefaultShareText(input: ShareTextInput): string {
  const now = input.now ?? new Date();
  const who = input.scientificName ? `${input.name} (${input.scientificName})` : input.name;
  const lines: string[] = [];

  if (input.mode === "beforeAfter" && input.beforeDate && input.afterDate) {
    lines.push(`Avant / après : ${who}, ${formatElapsed(input.beforeDate, input.afterDate)} d'écart entre ces deux photos.`);
  } else {
    lines.push(`Je vous présente ${who}, dans ma jungle depuis ${formatElapsed(input.since, now)}.`);
  }

  const facts: string[] = [];
  if (input.waterings > 0) facts.push(`arrosée ${plural(input.waterings, "fois", "fois")}`);
  if (input.fertilizings > 0) facts.push(`nourrie ${plural(input.fertilizings, "fois", "fois")}`);
  if (facts.length > 0) lines.push(`Déjà ${facts.join(" et ")}.`);
  if (input.healthLevel) lines.push(`État de santé : ${HEALTH_LABEL[input.healthLevel].toLowerCase()}.`);

  lines.push("Suivie avec Jungly.");
  return lines.join(" ");
}
