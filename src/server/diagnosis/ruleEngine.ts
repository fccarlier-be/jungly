/**
 * Coeur metier du diagnostic : systeme a REGLES PONDEREES (pas de LLM, pas
 * de ML) encodant de la connaissance horticole classique, croisant le
 * symptome rapporte (QCM) ET le contexte local reel de la plante
 * (historique d'arrosage/fertilisation, meteo recente, anciennete...).
 * C'est ce croisement -- pas le symptome seul -- qui fait la valeur ajoutee
 * par rapport a une identification Pl@ntNet brute.
 *
 * Chaque regle est une fonction pure qui renvoie une Hypothesis (ou null si
 * elle ne se declenche pas). `confidence` est toujours qualitative
 * (PROBABLE/POSSIBLE/PEU_PROBABLE) -- jamais un pourcentage precis, pour ne
 * pas donner une fausse impression de certitude sur une heuristique.
 */
import type {
  DiagnosisConfidence,
  Hypothesis,
  LocalContext,
  PlantnetDiseaseCandidate,
  QcmAnswers,
  SymptomCategory,
  SymptomVector,
} from "@/server/diagnosis/types";

function answerIs(answers: QcmAnswers, questionId: string, optionId: string): boolean {
  const value = answers[questionId];
  if (value == null) return false;
  return Array.isArray(value) ? value.includes(optionId) : value === optionId;
}

function is(vector: SymptomVector, ...categories: SymptomCategory[]): boolean {
  return (categories as string[]).includes(vector.category);
}

// Un arrosage recent (quelques jours) exclut mecaniquement le sous-arrosage
// comme cause d'un fletrissement -- au-dela, on ne peut plus rien en
// deduire avec certitude.
const RECENT_WATERING_THRESHOLD_DAYS = 3;

// Recent au sens "choc d'acclimatation encore plausible" -- au-dela, on
// considere que la plante s'est installee.
const RECENT_ACQUISITION_THRESHOLD_DAYS = 30;

type Rule = (vector: SymptomVector, ctx: LocalContext) => Hypothesis | null;

/** Sous-arrosage : retard reel sur le calendrier theorique + symptome coherent. */
const underwatering: Rule = (vector, ctx) => {
  const relevantSymptom =
    (is(vector, "WILTING") && answerIs(vector.answers, "soilMoisture", "dry")) ||
    (is(vector, "BROWN_LEAVES") && answerIs(vector.answers, "brownZone", "edges") && answerIs(vector.answers, "texture", "dryBrittle")) ||
    is(vector, "DROPPING_LEAVES");
  if (!relevantSymptom) return null;
  if (ctx.wateringGapDays == null || ctx.wateringGapDays <= 0) return null;

  return {
    id: "underwatering",
    label: "Sous-arrosage",
    confidence: ctx.wateringGapDays >= 3 ? "PROBABLE" : "POSSIBLE",
    evidenceFor: [`Arrosage en retard de ${ctx.wateringGapDays} jour(s) par rapport à la règle théorique.`],
    evidenceAgainst: [],
    verifications: ["Vérifier la sécheresse du substrat au toucher (2-3 cm de profondeur)"],
    actions: ["Arroser normalement puis reprendre le rythme habituel", "Vérifier que le pot draine correctement"],
  };
};

/** Sur-arrosage / pourriture racinaire : arrosage recent MAIS symptome de sol trop humide. */
const overwateringRootRot: Rule = (vector, ctx) => {
  const relevantSymptom =
    (is(vector, "WILTING") && answerIs(vector.answers, "soilMoisture", "moist")) ||
    (is(vector, "BROWN_LEAVES") && answerIs(vector.answers, "texture", "softMushy"));
  if (!relevantSymptom) return null;
  if (ctx.daysSinceLastWatering == null || ctx.daysSinceLastWatering > RECENT_WATERING_THRESHOLD_DAYS) return null;

  return {
    id: "overwatering_root_rot",
    label: "Sur-arrosage / début de pourriture racinaire",
    confidence: "POSSIBLE",
    evidenceFor: [
      `Arrosage récent (il y a ${ctx.daysSinceLastWatering} jour(s)) alors que le symptôme suggère un excès d'eau.`,
    ],
    evidenceAgainst: [],
    verifications: ["Vérifier l'odeur et la texture du substrat/des racines (odeur de pourri, racines brunes et molles = signal fort)"],
    actions: ["Espacer les prochains arrosages", "Rempoter dans un substrat frais si les racines sont abîmées", "Vérifier le drainage du pot"],
  };
};

/** Carence en azote : jaunissement des vieilles feuilles, uniforme, nervures comprises. */
const nitrogenDeficiency: Rule = (vector, ctx) => {
  if (!is(vector, "YELLOW_LEAVES")) return null;
  if (!answerIs(vector.answers, "leafAge", "old")) return null;
  if (!answerIs(vector.answers, "pattern", "uniform")) return null;
  if (!answerIs(vector.answers, "veinColor", "yellowVeins")) return null;

  const fertilizingLate =
    ctx.fertilizingRuleIntervalDays == null ||
    (ctx.daysSinceLastFertilizing != null && ctx.daysSinceLastFertilizing > ctx.fertilizingRuleIntervalDays);
  if (!fertilizingLate) return null;

  return {
    id: "nitrogen_deficiency",
    label: "Carence en azote",
    confidence: "POSSIBLE",
    evidenceFor: [
      "Jaunissement uniforme des vieilles feuilles, nervures comprises (signature classique d'une carence en azote).",
      ctx.fertilizingRuleIntervalDays == null
        ? "Aucune règle de fertilisation active pour cette plante."
        : `Fertilisation en retard (${ctx.daysSinceLastFertilizing} jour(s) depuis le dernier apport, règle à ${ctx.fertilizingRuleIntervalDays} jours).`,
    ],
    evidenceAgainst: [],
    verifications: ["Vérifier la date du dernier apport d'engrais dans l'historique de la plante"],
    actions: ["Reprendre un apport d'engrais équilibré adapté à la saison", "Mettre en place une règle de fertilisation régulière si absente"],
  };
};

/** Chlorose ferrique : jaunissement des JEUNES feuilles, nervures encore vertes -- independant de la fertilisation. */
const ironChlorosis: Rule = (vector) => {
  if (!is(vector, "YELLOW_LEAVES")) return null;
  if (!answerIs(vector.answers, "leafAge", "young")) return null;
  if (!answerIs(vector.answers, "veinColor", "greenVeins")) return null;

  return {
    id: "iron_chlorosis",
    label: "Chlorose ferrique (carence en fer)",
    confidence: "POSSIBLE",
    evidenceFor: ["Jaunissement des jeunes feuilles avec nervures restées vertes (signature classique de la chlorose ferrique)."],
    evidenceAgainst: [],
    verifications: ["Vérifier le pH du substrat si connu (un substrat trop calcaire bloque l'absorption du fer)"],
    actions: ["Apporter un engrais contenant du fer chélaté (séquestrène)", "Éviter l'eau très calcaire pour l'arrosage"],
  };
};

/** Senescence naturelle : une seule vieille feuille isolee, rien d'alarmant par ailleurs -- eviter de sur-diagnostiquer. */
const naturalSenescence: Rule = (vector, ctx) => {
  const relevantSymptom =
    (is(vector, "YELLOW_LEAVES") && answerIs(vector.answers, "leafAge", "old")) ||
    (is(vector, "DROPPING_LEAVES") && answerIs(vector.answers, "leafAge", "old"));
  if (!relevantSymptom) return null;
  if (!answerIs(vector.answers, "affectedLeafCount", "single")) return null;

  const noAlarmingContext =
    !ctx.recentHeatStress &&
    !ctx.recentColdSnap &&
    ctx.exposureMismatch !== true &&
    (ctx.wateringGapDays == null || ctx.wateringGapDays <= 0);

  return {
    id: "natural_senescence",
    label: "Sénescence naturelle (vieillissement normal)",
    confidence: noAlarmingContext ? "PROBABLE" : "POSSIBLE",
    evidenceFor: ["Une seule feuille âgée isolée touchée, sans autre signal alarmant."],
    evidenceAgainst: [],
    verifications: ["Observer si d'autres feuilles sont touchées dans les jours suivants"],
    actions: ["Retirer la feuille concernée si elle est entièrement jaunie/tombée", "Pas d'action corrective nécessaire dans l'immédiat"],
  };
};

/** Stress thermique / coup de chaud. */
const heatStress: Rule = (vector, ctx) => {
  if (!ctx.recentHeatStress) return null;
  if (!is(vector, "WILTING", "BROWN_LEAVES")) return null;

  return {
    id: "heat_stress",
    label: "Stress thermique (coup de chaud)",
    confidence: "POSSIBLE",
    evidenceFor: ["Températures récentes élevées (moyenne des maximales > 30 °C)."],
    evidenceAgainst: [],
    verifications: ["Vérifier l'exposition directe au soleil aux heures les plus chaudes"],
    actions: ["Éloigner temporairement la plante des fortes chaleurs/du plein soleil", "Augmenter légèrement la fréquence d'arrosage le temps de l'épisode"],
  };
};

/** Choc du froid. */
const coldShock: Rule = (vector, ctx) => {
  if (!ctx.recentColdSnap) return null;
  if (!is(vector, "BROWN_LEAVES", "DROPPING_LEAVES")) return null;

  return {
    id: "cold_shock",
    label: "Choc du froid",
    confidence: "POSSIBLE",
    evidenceFor: ["Températures récentes basses (moyenne des maximales < 15 °C) non prévues par une règle saisonnière."],
    evidenceAgainst: [],
    verifications: ["Vérifier la proximité d'une fenêtre/courant d'air froid"],
    actions: ["Éloigner la plante des sources de froid (fenêtre, courant d'air)", "Attendre le retour à une température stable avant d'agir davantage"],
  };
};

/** Exces de lumiere / brulure. */
const lightBurn: Rule = (vector, ctx) => {
  if (ctx.exposureMismatch !== true) return null;
  if (!is(vector, "SPOTS", "BROWN_LEAVES")) return null;

  return {
    id: "light_burn",
    label: "Excès de lumière / brûlure",
    confidence: "POSSIBLE",
    evidenceFor: ["L'exposition réelle de la plante ne correspond pas à l'exposition recommandée pour cette espèce."],
    evidenceAgainst: [],
    verifications: ["Vérifier si les zones atteintes sont du côté le plus exposé au soleil"],
    actions: ["Déplacer la plante vers une exposition plus adaptée", "Filtrer la lumière directe (voilage) si le déplacement n'est pas possible"],
  };
};

/** Manque de lumiere / etiolement. */
const lowLightEtiolation: Rule = (vector, ctx) => {
  if (!is(vector, "ABNORMAL_GROWTH")) return null;
  if (!answerIs(vector.answers, "growthType", "etiolated")) return null;
  if (ctx.exposureMismatch !== true) return null;

  return {
    id: "low_light_etiolation",
    label: "Manque de lumière (étiolement)",
    confidence: "PROBABLE",
    evidenceFor: ["Tiges qui s'étirent vers la lumière, exposition réelle non adaptée à l'espèce."],
    evidenceAgainst: [],
    verifications: ["Comparer la distance à la source de lumière avec les recommandations de l'espèce"],
    actions: ["Rapprocher la plante d'une source de lumière plus forte", "Tailler les tiges étiolées pour relancer une croissance compacte"],
  };
};

/** Cochenilles : residu collant ou points blancs cotonneux. */
const mealybugs: Rule = (vector) => {
  if (!is(vector, "PESTS")) return null;
  if (!answerIs(vector.answers, "traceType", "cottonyDots") && !answerIs(vector.answers, "traceType", "stickyResidue")) return null;

  return {
    id: "mealybugs",
    label: "Cochenilles",
    confidence: "POSSIBLE",
    evidenceFor: ["Résidu collant et/ou amas blancs cotonneux mentionnés, caractéristiques des cochenilles."],
    evidenceAgainst: [],
    verifications: ["Chercher les amas blancs cotonneux à l'aisselle des feuilles et sous les feuilles"],
    actions: ["Nettoyer à l'alcool à 70° sur coton-tige pour les foyers visibles", "Traiter au savon noir/huile horticole en cas d'infestation étendue"],
  };
};

/** Araignees rouges : fines toiles. */
const spiderMites: Rule = (vector) => {
  if (!is(vector, "PESTS")) return null;
  if (!answerIs(vector.answers, "traceType", "webbing")) return null;

  return {
    id: "spider_mites",
    label: "Araignées rouges",
    confidence: "POSSIBLE",
    evidenceFor: ["Fines toiles mentionnées, caractéristiques des araignées rouges (souvent en air sec)."],
    evidenceAgainst: [],
    verifications: ["Observer sous les feuilles à la loupe (petits points mobiles) et l'hygrométrie ambiante"],
    actions: ["Augmenter l'hygrométrie (brumisation, coupelle d'eau)", "Doucher le feuillage puis traiter au savon noir si confirmé"],
  };
};

/** Pucerons : sur les jeunes pousses/nouvelles tiges. */
const aphids: Rule = (vector) => {
  if (!is(vector, "PESTS")) return null;
  if (!answerIs(vector.answers, "location", "youngShoots")) return null;

  return {
    id: "aphids",
    label: "Pucerons",
    confidence: "POSSIBLE",
    evidenceFor: ["Parasites concentrés sur les jeunes pousses/nouvelles tiges, typique des pucerons."],
    evidenceAgainst: [],
    verifications: ["Vérifier la présence de petits insectes verts/noirs groupés sur les jeunes pousses"],
    actions: ["Doucher les pousses concernées", "Traiter au savon noir si l'infestation persiste"],
  };
};

/** Oidium : taches blanches poudreuses. */
const powderyMildew: Rule = (vector) => {
  if (!is(vector, "SPOTS")) return null;
  if (!answerIs(vector.answers, "spotColor", "white")) return null;
  if (!answerIs(vector.answers, "spotTexture", "powdery")) return null;

  return {
    id: "powdery_mildew",
    label: "Oïdium (poudre blanche)",
    confidence: "PROBABLE",
    evidenceFor: ["Taches blanches poudreuses, signature très caractéristique de l'oïdium."],
    evidenceAgainst: [],
    verifications: ["Frotter une tache pour confirmer l'aspect poudreux (farine) plutôt qu'un dépôt fixe"],
    actions: ["Isoler la plante des autres pour limiter la propagation", "Améliorer la circulation d'air", "Traiter au fongicide adapté ou bicarbonate dilué"],
  };
};

/** Taches fongiques (type anthracnose/tache foliaire) : halo + extension. */
const fungalLeafSpot: Rule = (vector) => {
  if (!is(vector, "SPOTS")) return null;
  if (!answerIs(vector.answers, "halo", "withHalo")) return null;
  if (!answerIs(vector.answers, "evolution", "spreading")) return null;

  return {
    id: "fungal_leaf_spot",
    label: "Tache fongique (type anthracnose / tache foliaire)",
    confidence: "POSSIBLE",
    evidenceFor: ["Taches avec halo qui s'étendent dans le temps, évocateur d'une maladie fongique foliaire."],
    evidenceAgainst: [],
    verifications: ["Suivre l'évolution des taches sur quelques jours (photo à l'appui)"],
    actions: ["Retirer les feuilles les plus atteintes", "Éviter de mouiller le feuillage à l'arrosage", "Traiter au fongicide adapté si ça s'aggrave"],
  };
};

/** Choc de rempotage / acclimatation : acquisition recente, quasiment n'importe quel symptome. */
const repottingShock: Rule = (vector, ctx) => {
  if (ctx.daysSinceAcquired == null || ctx.daysSinceAcquired >= RECENT_ACQUISITION_THRESHOLD_DAYS) return null;

  return {
    id: "repotting_acclimation_shock",
    label: "Choc de rempotage / acclimatation",
    confidence: "PEU_PROBABLE",
    evidenceFor: [`Plante acquise il y a seulement ${ctx.daysSinceAcquired} jour(s) -- une période d'acclimatation est encore plausible.`],
    evidenceAgainst: [],
    verifications: ["Comparer avec l'état de la plante au moment de l'acquisition si des photos existent"],
    actions: ["Laisser le temps à la plante de s'acclimater (éviter les changements supplémentaires)", "Maintenir un entretien standard et stable"],
  };
};

const RULES: Rule[] = [
  underwatering,
  overwateringRootRot,
  nitrogenDeficiency,
  ironChlorosis,
  naturalSenescence,
  heatStress,
  coldShock,
  lightBurn,
  lowLightEtiolation,
  mealybugs,
  spiderMites,
  aphids,
  powderyMildew,
  fungalLeafSpot,
  repottingShock,
];

// Mots-cles (en minuscules, sans accents geres au mieux) permettant de
// relier un nom de maladie/nuisible renvoye par Pl@ntNet a l'une des
// hypotheses ci-dessus. Le resultat Pl@ntNet n'est JAMAIS une conclusion en
// soi : c'est un signal de plus, ajoute en preuve POUR une hypothese deja
// fondee sur le croisement symptome/contexte -- voir attachPlantnetEvidence.
const PLANTNET_KEYWORDS: Record<string, string[]> = {
  overwatering_root_rot: ["pourriture", "root rot", "phytophthora", "pythium", "rhizoctonia"],
  mealybugs: ["cochenille", "mealybug", "pseudococc", "coccus", "coccid"],
  spider_mites: ["tetranyque", "spider mite", "acarien", "tetranychus"],
  aphids: ["puceron", "aphid", "aphis"],
  powdery_mildew: ["oidium", "oïdium", "powdery mildew", "erysiph"],
  fungal_leaf_spot: ["anthracnose", "tache foliaire", "leaf spot", "cercospora", "septoria", "colletotrichum"],
};

function normalize(text: string): string {
  return text.toLowerCase();
}

function matchesKeywords(diseaseName: string, keywords: string[]): boolean {
  const normalized = normalize(diseaseName);
  return keywords.some((keyword) => normalized.includes(keyword));
}

// Formulation qualitative par palier plutot qu'un pourcentage brut dans la
// phrase de preuve -- le score reste visible tel quel dans l'encart
// "Resultat visuel Pl@ntNet" (DiagnosisResult.tsx), mais "(score 46%)" cite
// au milieu d'une phrase donne une fausse impression de precision (retour
// utilisateur, 2026-09-23) alors que le principe du moteur est justement de
// ne jamais afficher de pourcentage comme s'il s'agissait d'une certitude.
function plantnetConfidencePhrase(score: number): string {
  const percent = Math.round(score * 100);
  if (percent <= 20) return "Pl@ntNet n'est pas sûr, mais évoque";
  if (percent <= 40) return "Pl@ntNet suggère peut-être";
  if (percent <= 60) return "Pl@ntNet suggère";
  if (percent <= 80) return "Pl@ntNet penche pour";
  return "Pl@ntNet est plutôt confiant sur";
}

/**
 * Ajoute (si pertinent) le resultat Pl@ntNet comme preuve POUR les
 * hypotheses deja generees par les regles locales. Un candidat qui ne
 * matche aucune regle connue n'obtient PAS sa propre carte d'hypothese --
 * il est deja affiche tel quel dans l'encart "Resultat visuel Pl@ntNet"
 * (voir DiagnosisResult.tsx), clairement labellise "une piste parmi
 * d'autres, pas une conclusion" ; le re-afficher comme hypothese distincte
 * pour CHAQUE candidat non apparie (jusqu'a 5) noyait le vrai contenu du
 * diagnostic sous des cartes quasi identiques au texte generique --
 * retour utilisateur, 2026-09-23.
 */
function attachPlantnetEvidence(hypotheses: Hypothesis[], plantnetDisease: PlantnetDiseaseCandidate[] | null): Hypothesis[] {
  if (!plantnetDisease || plantnetDisease.length === 0) {
    return hypotheses;
  }

  const byId = new Map(hypotheses.map((h) => [h.id, h]));

  for (const candidate of plantnetDisease) {
    for (const [hypothesisId, keywords] of Object.entries(PLANTNET_KEYWORDS)) {
      const hypothesis = byId.get(hypothesisId);
      if (hypothesis && matchesKeywords(candidate.name, keywords)) {
        hypothesis.evidenceFor.push(
          `${plantnetConfidencePhrase(candidate.score)} "${candidate.name}" -- un signal parmi d'autres, pas une conclusion à lui seul.`,
        );
      }
    }
  }

  return hypotheses;
}

function fallbackHypothesis(): Hypothesis {
  return {
    id: "unknown_cause",
    label: "Cause non déterminée avec les informations disponibles",
    confidence: "PEU_PROBABLE",
    evidenceFor: [],
    evidenceAgainst: [],
    verifications: ["Observer l'évolution sur quelques jours", "Vérifier l'état des racines et du substrat"],
    actions: ["Maintenir un entretien standard", "Reprendre le diagnostic si le symptôme persiste ou s'aggrave"],
  };
}

const CONFIDENCE_RANK: Record<DiagnosisConfidence, number> = {
  PROBABLE: 3,
  POSSIBLE: 2,
  PEU_PROBABLE: 1,
};

function sortByConfidence(hypotheses: Hypothesis[]): Hypothesis[] {
  return [...hypotheses].sort((a, b) => {
    const rankDiff = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
    if (rankDiff !== 0) return rankDiff;
    return b.evidenceFor.length - a.evidenceFor.length;
  });
}

export function computeHypotheses(input: {
  symptomVector: SymptomVector;
  localContext: LocalContext;
  plantnetDisease: PlantnetDiseaseCandidate[] | null;
}): Hypothesis[] {
  const { symptomVector, localContext, plantnetDisease } = input;

  const triggered = RULES.map((rule) => rule(symptomVector, localContext)).filter((h): h is Hypothesis => h !== null);

  const withEvidence = attachPlantnetEvidence(triggered, plantnetDisease);

  if (withEvidence.length === 0) {
    return [fallbackHypothesis()];
  }

  return sortByConfidence(withEvidence);
}
