/**
 * Arbre de questions de suivi du diagnostic photo. Contrainte produit
 * explicite : quelques questions COURTES et concretes par categorie, jamais
 * un formulaire interminable -- 2 a 4 questions max, options courtes.
 *
 * Les `id` de question/option sont des cles internes stables (utilisees par
 * ruleEngine.ts et persistees dans QcmAnswers/HealthDiagnosis.symptomAnswers)
 * -- jamais affichees telles quelles, jamais renommees sans migrer les
 * diagnostics deja enregistres.
 */
import type { QcmQuestion, SymptomCategory } from "@/server/diagnosis/types";

// Question reutilisee telle quelle par plusieurs categories (YELLOW_LEAVES,
// BROWN_LEAVES, DROPPING_LEAVES) : distingue "une feuille isolee" (souvent
// de la senescence naturelle, rien d'alarmant) de "plusieurs feuilles"
// (signal potentiellement plus serieux) -- voir ruleEngine.ts.
const AFFECTED_LEAF_COUNT_QUESTION: QcmQuestion = {
  id: "affectedLeafCount",
  question: "Combien de feuilles sont concernées ?",
  multiple: false,
  options: [
    { id: "single", label: "Une seule feuille isolée" },
    { id: "several", label: "Plusieurs feuilles" },
    { id: "most", label: "La plupart des feuilles" },
  ],
};

const YELLOW_LEAVES_QUESTIONS: QcmQuestion[] = [
  {
    id: "leafAge",
    question: "Les feuilles jaunes sont-elles plutôt jeunes ou âgées ?",
    multiple: false,
    options: [
      { id: "young", label: "Jeunes (nouvelles pousses)" },
      { id: "old", label: "Âgées (bas de la plante)" },
      { id: "mixed", label: "Un peu des deux" },
    ],
  },
  {
    id: "veinColor",
    question: "Les nervures restent-elles vertes ou jaunissent-elles aussi ?",
    multiple: false,
    options: [
      { id: "greenVeins", label: "Nervures encore vertes" },
      { id: "yellowVeins", label: "Toute la feuille jaunit, nervures comprises" },
      { id: "notSure", label: "Difficile à dire" },
    ],
  },
  {
    id: "pattern",
    question: "Le jaunissement est-il uniforme ou par taches ?",
    multiple: false,
    options: [
      { id: "uniform", label: "Uniforme sur la feuille" },
      { id: "patches", label: "Par taches" },
      { id: "tips", label: "Seulement les pointes/bords" },
    ],
  },
  AFFECTED_LEAF_COUNT_QUESTION,
];

const BROWN_LEAVES_QUESTIONS: QcmQuestion[] = [
  {
    id: "brownZone",
    question: "Le brunissement touche-t-il les bords/pointes ou toute la feuille ?",
    multiple: false,
    options: [
      { id: "edges", label: "Bords ou pointes seulement" },
      { id: "wholeLeaf", label: "Toute la feuille" },
      { id: "patches", label: "Par taches irrégulières" },
    ],
  },
  {
    id: "texture",
    question: "La zone brunie est-elle sèche et cassante, ou molle et spongieuse ?",
    multiple: false,
    options: [
      { id: "dryBrittle", label: "Sèche et cassante" },
      { id: "softMushy", label: "Molle et spongieuse" },
      { id: "normalTexture", label: "Texture normale, juste décolorée" },
    ],
  },
  AFFECTED_LEAF_COUNT_QUESTION,
];

const DROPPING_LEAVES_QUESTIONS: QcmQuestion[] = [
  {
    id: "leafAge",
    question: "Les feuilles qui tombent sont-elles jeunes ou âgées ?",
    multiple: false,
    options: [
      { id: "young", label: "Jeunes (nouvelles pousses)" },
      { id: "old", label: "Âgées (bas de la plante)" },
      { id: "mixed", label: "Un peu des deux" },
    ],
  },
  {
    id: "onset",
    question: "La chute est-elle apparue soudainement ou progressivement ?",
    multiple: false,
    options: [
      { id: "sudden", label: "Soudaine" },
      { id: "progressive", label: "Progressive" },
      { id: "notSure", label: "Difficile à dire" },
    ],
  },
  AFFECTED_LEAF_COUNT_QUESTION,
];

const WILTING_QUESTIONS: QcmQuestion[] = [
  {
    id: "soilMoisture",
    question: "Le sol est-il sec ou humide au moment où la plante fléchit ?",
    multiple: false,
    options: [
      { id: "dry", label: "Le sol est sec" },
      { id: "moist", label: "Le sol est humide" },
      { id: "notSure", label: "Difficile à dire" },
    ],
  },
  {
    id: "onset",
    question: "Le fléchissement est-il apparu soudainement ou progressivement ?",
    multiple: false,
    options: [
      { id: "sudden", label: "Soudain" },
      { id: "progressive", label: "Progressif" },
      { id: "notSure", label: "Difficile à dire" },
    ],
  },
];

const SPOTS_QUESTIONS: QcmQuestion[] = [
  {
    id: "spotColor",
    question: "De quelle couleur sont les taches ?",
    multiple: false,
    options: [
      { id: "brown", label: "Brunes" },
      { id: "black", label: "Noires" },
      { id: "white", label: "Blanches" },
      { id: "yellow", label: "Jaunes" },
    ],
  },
  {
    id: "spotTexture",
    question: "Les taches sont-elles poudreuses, comme de la farine ?",
    multiple: false,
    options: [
      { id: "powdery", label: "Oui, poudreuses" },
      { id: "notPowdery", label: "Non, plates" },
      { id: "notSure", label: "Difficile à dire" },
    ],
  },
  {
    id: "halo",
    question: "Les taches ont-elles un halo (auréole) autour ?",
    multiple: false,
    options: [
      { id: "withHalo", label: "Oui, avec un halo" },
      { id: "noHalo", label: "Non, pas de halo" },
      { id: "notSure", label: "Difficile à dire" },
    ],
  },
  {
    id: "evolution",
    question: "Les taches s'étendent-elles ou restent-elles stables ?",
    multiple: false,
    options: [
      { id: "spreading", label: "Elles s'étendent" },
      { id: "stable", label: "Elles restent stables" },
      { id: "notSure", label: "Trop tôt pour le dire" },
    ],
  },
];

const PESTS_QUESTIONS: QcmQuestion[] = [
  {
    id: "visibility",
    question: "Voyez-vous des insectes/parasites à l'œil nu, ou seulement des traces ?",
    multiple: false,
    options: [
      { id: "visibleInsects", label: "Insectes visibles" },
      { id: "tracesOnly", label: "Traces seulement" },
      { id: "both", label: "Les deux" },
    ],
  },
  {
    // multiple:true car plusieurs types de traces peuvent coexister
    // reellement (ex. toiles fines ET residu collant).
    id: "traceType",
    question: "Quel type de traces observez-vous ?",
    multiple: true,
    options: [
      { id: "webbing", label: "Fines toiles" },
      { id: "stickyResidue", label: "Résidu collant" },
      { id: "cottonyDots", label: "Points blancs cotonneux" },
      { id: "blackDots", label: "Points noirs" },
    ],
  },
  {
    id: "location",
    question: "Où se trouvent-ils principalement ?",
    multiple: false,
    options: [
      { id: "youngShoots", label: "Jeunes pousses / nouvelles tiges" },
      { id: "leafUnderside", label: "Dessous des feuilles" },
      { id: "allOverPlant", label: "Partout sur la plante" },
    ],
  },
];

const ABNORMAL_GROWTH_QUESTIONS: QcmQuestion[] = [
  {
    id: "growthType",
    question: "Comment décririez-vous la croissance anormale ?",
    multiple: false,
    options: [
      { id: "slowed", label: "Ralentie" },
      { id: "deformed", label: "Déformée" },
      { id: "etiolated", label: "Étiolée (tiges qui s'étirent vers la lumière)" },
    ],
  },
  {
    id: "affectedPart",
    question: "Quelle partie de la plante est concernée ?",
    multiple: false,
    options: [
      { id: "newGrowth", label: "Nouvelles pousses seulement" },
      { id: "stemsOnly", label: "Les tiges" },
      { id: "wholePlant", label: "Toute la plante" },
    ],
  },
];

const FLOWERING_ISSUE_QUESTIONS: QcmQuestion[] = [
  {
    id: "issueType",
    question: "Quel est le problème de floraison ?",
    multiple: false,
    options: [
      { id: "noFlowers", label: "Pas de fleurs du tout" },
      { id: "budDrop", label: "Boutons qui tombent avant ouverture" },
      { id: "fastWilt", label: "Fleurs qui flétrissent vite" },
    ],
  },
  {
    id: "recentChange",
    question: "Un changement récent a-t-il précédé ce problème (déplacement, rempotage, luminosité) ?",
    multiple: false,
    options: [
      { id: "yes", label: "Oui, un changement récent" },
      { id: "no", label: "Non, rien de particulier" },
      { id: "notSure", label: "Je ne sais pas" },
    ],
  },
];

// "OTHER" n'a pas de suivi type -- l'utilisateur passe directement aux
// photos plutot que de repondre a des questions generiques peu utiles.
const OTHER_QUESTIONS: QcmQuestion[] = [];

const QUESTIONS_BY_CATEGORY: Record<SymptomCategory, QcmQuestion[]> = {
  YELLOW_LEAVES: YELLOW_LEAVES_QUESTIONS,
  BROWN_LEAVES: BROWN_LEAVES_QUESTIONS,
  DROPPING_LEAVES: DROPPING_LEAVES_QUESTIONS,
  WILTING: WILTING_QUESTIONS,
  SPOTS: SPOTS_QUESTIONS,
  PESTS: PESTS_QUESTIONS,
  ABNORMAL_GROWTH: ABNORMAL_GROWTH_QUESTIONS,
  FLOWERING_ISSUE: FLOWERING_ISSUE_QUESTIONS,
  OTHER: OTHER_QUESTIONS,
};

export function getFollowUpQuestions(category: SymptomCategory): QcmQuestion[] {
  return QUESTIONS_BY_CATEGORY[category];
}
