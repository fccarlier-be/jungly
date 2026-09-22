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
  question: "Combien de feuilles sont concernees ?",
  multiple: false,
  options: [
    { id: "single", label: "Une seule feuille isolee" },
    { id: "several", label: "Plusieurs feuilles" },
    { id: "most", label: "La plupart des feuilles" },
  ],
};

const YELLOW_LEAVES_QUESTIONS: QcmQuestion[] = [
  {
    id: "leafAge",
    question: "Les feuilles jaunes sont-elles plutot jeunes ou agees ?",
    multiple: false,
    options: [
      { id: "young", label: "Jeunes (nouvelles pousses)" },
      { id: "old", label: "Agees (bas de la plante)" },
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
      { id: "notSure", label: "Difficile a dire" },
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
      { id: "patches", label: "Par taches irregulieres" },
    ],
  },
  {
    id: "texture",
    question: "La zone brunie est-elle seche et cassante, ou molle et spongieuse ?",
    multiple: false,
    options: [
      { id: "dryBrittle", label: "Seche et cassante" },
      { id: "softMushy", label: "Molle et spongieuse" },
      { id: "normalTexture", label: "Texture normale, juste decoloree" },
    ],
  },
  AFFECTED_LEAF_COUNT_QUESTION,
];

const DROPPING_LEAVES_QUESTIONS: QcmQuestion[] = [
  {
    id: "leafAge",
    question: "Les feuilles qui tombent sont-elles jeunes ou agees ?",
    multiple: false,
    options: [
      { id: "young", label: "Jeunes (nouvelles pousses)" },
      { id: "old", label: "Agees (bas de la plante)" },
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
      { id: "notSure", label: "Difficile a dire" },
    ],
  },
  AFFECTED_LEAF_COUNT_QUESTION,
];

const WILTING_QUESTIONS: QcmQuestion[] = [
  {
    id: "soilMoisture",
    question: "Le sol est-il sec ou humide au moment ou la plante flechit ?",
    multiple: false,
    options: [
      { id: "dry", label: "Le sol est sec" },
      { id: "moist", label: "Le sol est humide" },
      { id: "notSure", label: "Difficile a dire" },
    ],
  },
  {
    id: "onset",
    question: "Le flechissement est-il apparu soudainement ou progressivement ?",
    multiple: false,
    options: [
      { id: "sudden", label: "Soudain" },
      { id: "progressive", label: "Progressif" },
      { id: "notSure", label: "Difficile a dire" },
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
      { id: "notSure", label: "Difficile a dire" },
    ],
  },
  {
    id: "halo",
    question: "Les taches ont-elles un halo (aureole) autour ?",
    multiple: false,
    options: [
      { id: "withHalo", label: "Oui, avec un halo" },
      { id: "noHalo", label: "Non, pas de halo" },
      { id: "notSure", label: "Difficile a dire" },
    ],
  },
  {
    id: "evolution",
    question: "Les taches s'etendent-elles ou restent-elles stables ?",
    multiple: false,
    options: [
      { id: "spreading", label: "Elles s'etendent" },
      { id: "stable", label: "Elles restent stables" },
      { id: "notSure", label: "Trop tot pour le dire" },
    ],
  },
];

const PESTS_QUESTIONS: QcmQuestion[] = [
  {
    id: "visibility",
    question: "Voyez-vous des insectes/parasites a l'oeil nu, ou seulement des traces ?",
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
      { id: "stickyResidue", label: "Residu collant" },
      { id: "cottonyDots", label: "Points blancs cotonneux" },
      { id: "blackDots", label: "Points noirs" },
    ],
  },
  {
    id: "location",
    question: "Ou se trouvent-ils principalement ?",
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
    question: "Comment decririez-vous la croissance anormale ?",
    multiple: false,
    options: [
      { id: "slowed", label: "Ralentie" },
      { id: "deformed", label: "Deformee" },
      { id: "etiolated", label: "Etiolee (tiges qui s'etirent vers la lumiere)" },
    ],
  },
  {
    id: "affectedPart",
    question: "Quelle partie de la plante est concernee ?",
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
    question: "Quel est le probleme de floraison ?",
    multiple: false,
    options: [
      { id: "noFlowers", label: "Pas de fleurs du tout" },
      { id: "budDrop", label: "Boutons qui tombent avant ouverture" },
      { id: "fastWilt", label: "Fleurs qui fletrissent vite" },
    ],
  },
  {
    id: "recentChange",
    question: "Un changement recent a-t-il precede ce probleme (deplacement, rempotage, luminosite) ?",
    multiple: false,
    options: [
      { id: "yes", label: "Oui, un changement recent" },
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
