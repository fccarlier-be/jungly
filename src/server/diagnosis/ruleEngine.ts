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
    evidenceFor: [`Arrosage en retard de ${ctx.wateringGapDays} jour(s) par rapport a la regle theorique.`],
    evidenceAgainst: [],
    verifications: ["Verifier la secheresse du substrat au toucher (2-3 cm de profondeur)"],
    actions: ["Arroser normalement puis reprendre le rythme habituel", "Verifier que le pot draine correctement"],
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
    label: "Sur-arrosage / debut de pourriture racinaire",
    confidence: "POSSIBLE",
    evidenceFor: [
      `Arrosage recent (il y a ${ctx.daysSinceLastWatering} jour(s)) alors que le symptome suggere un exces d'eau.`,
    ],
    evidenceAgainst: [],
    verifications: ["Verifier l'odeur et la texture du substrat/des racines (odeur de pourri, racines brunes et molles = signal fort)"],
    actions: ["Espacer les prochains arrosages", "Rempoter dans un substrat frais si les racines sont abimees", "Verifier le drainage du pot"],
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
        ? "Aucune regle de fertilisation active pour cette plante."
        : `Fertilisation en retard (${ctx.daysSinceLastFertilizing} jour(s) depuis le dernier apport, regle a ${ctx.fertilizingRuleIntervalDays} jours).`,
    ],
    evidenceAgainst: [],
    verifications: ["Verifier la date du dernier apport d'engrais dans l'historique de la plante"],
    actions: ["Reprendre un apport d'engrais equilibre adapte a la saison", "Mettre en place une regle de fertilisation reguliere si absente"],
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
    evidenceFor: ["Jaunissement des jeunes feuilles avec nervures restees vertes (signature classique de la chlorose ferrique)."],
    evidenceAgainst: [],
    verifications: ["Verifier le pH du substrat si connu (un substrat trop calcaire bloque l'absorption du fer)"],
    actions: ["Apporter un engrais contenant du fer chelate (sequestrene)", "Eviter l'eau tres calcaire pour l'arrosage"],
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
    label: "Senescence naturelle (vieillissement normal)",
    confidence: noAlarmingContext ? "PROBABLE" : "POSSIBLE",
    evidenceFor: ["Une seule feuille agee isolee touchee, sans autre signal alarmant."],
    evidenceAgainst: [],
    verifications: ["Observer si d'autres feuilles sont touchees dans les jours suivants"],
    actions: ["Retirer la feuille concernee si elle est entierement jaunie/tombee", "Pas d'action corrective necessaire dans l'immediat"],
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
    evidenceFor: ["Temperatures recentes elevees (moyenne des maximales > 30C)."],
    evidenceAgainst: [],
    verifications: ["Verifier l'exposition directe au soleil aux heures les plus chaudes"],
    actions: ["Eloigner temporairement la plante des fortes chaleurs/du plein soleil", "Augmenter legerement la frequence d'arrosage le temps de l'episode"],
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
    evidenceFor: ["Temperatures recentes basses (moyenne des maximales < 15C) non prevues par une regle saisonniere."],
    evidenceAgainst: [],
    verifications: ["Verifier la proximite d'une fenetre/courant d'air froid"],
    actions: ["Eloigner la plante des sources de froid (fenetre, courant d'air)", "Attendre le retour a une temperature stable avant d'agir davantage"],
  };
};

/** Exces de lumiere / brulure. */
const lightBurn: Rule = (vector, ctx) => {
  if (ctx.exposureMismatch !== true) return null;
  if (!is(vector, "SPOTS", "BROWN_LEAVES")) return null;

  return {
    id: "light_burn",
    label: "Exces de lumiere / brulure",
    confidence: "POSSIBLE",
    evidenceFor: ["L'exposition reelle de la plante ne correspond pas a l'exposition recommandee pour cette espece."],
    evidenceAgainst: [],
    verifications: ["Verifier si les zones atteintes sont du cote le plus expose au soleil"],
    actions: ["Deplacer la plante vers une exposition plus adaptee", "Filtrer la lumiere directe (voilage) si le deplacement n'est pas possible"],
  };
};

/** Manque de lumiere / etiolement. */
const lowLightEtiolation: Rule = (vector, ctx) => {
  if (!is(vector, "ABNORMAL_GROWTH")) return null;
  if (!answerIs(vector.answers, "growthType", "etiolated")) return null;
  if (ctx.exposureMismatch !== true) return null;

  return {
    id: "low_light_etiolation",
    label: "Manque de lumiere (etiolement)",
    confidence: "PROBABLE",
    evidenceFor: ["Tiges qui s'etirent vers la lumiere, exposition reelle non adaptee a l'espece."],
    evidenceAgainst: [],
    verifications: ["Comparer la distance a la source de lumiere avec les recommandations de l'espece"],
    actions: ["Rapprocher la plante d'une source de lumiere plus forte", "Tailler les tiges etiolees pour relancer une croissance compacte"],
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
    evidenceFor: ["Residu collant et/ou amas blancs cotonneux mentionnes, caracteristiques des cochenilles."],
    evidenceAgainst: [],
    verifications: ["Chercher les amas blancs cotonneux a l'aisselle des feuilles et sous les feuilles"],
    actions: ["Nettoyer a l'alcool a 70 sur coton-tige pour les foyers visibles", "Traiter au savon noir/huile horticole en cas d'infestation etendue"],
  };
};

/** Araignees rouges : fines toiles. */
const spiderMites: Rule = (vector) => {
  if (!is(vector, "PESTS")) return null;
  if (!answerIs(vector.answers, "traceType", "webbing")) return null;

  return {
    id: "spider_mites",
    label: "Araignees rouges",
    confidence: "POSSIBLE",
    evidenceFor: ["Fines toiles mentionnees, caracteristiques des araignees rouges (souvent en air sec)."],
    evidenceAgainst: [],
    verifications: ["Observer sous les feuilles a la loupe (petits points mobiles) et l'hygrometrie ambiante"],
    actions: ["Augmenter l'hygrometrie (brumisation, coupelle d'eau)", "Doucher le feuillage puis traiter au savon noir si confirme"],
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
    evidenceFor: ["Parasites concentres sur les jeunes pousses/nouvelles tiges, typique des pucerons."],
    evidenceAgainst: [],
    verifications: ["Verifier la presence de petits insectes verts/noirs groupes sur les jeunes pousses"],
    actions: ["Doucher les pousses concernees", "Traiter au savon noir si l'infestation persiste"],
  };
};

/** Oidium : taches blanches poudreuses. */
const powderyMildew: Rule = (vector) => {
  if (!is(vector, "SPOTS")) return null;
  if (!answerIs(vector.answers, "spotColor", "white")) return null;
  if (!answerIs(vector.answers, "spotTexture", "powdery")) return null;

  return {
    id: "powdery_mildew",
    label: "Oidium (poudre blanche)",
    confidence: "PROBABLE",
    evidenceFor: ["Taches blanches poudreuses, signature tres caracteristique de l'oidium."],
    evidenceAgainst: [],
    verifications: ["Frotter une tache pour confirmer l'aspect poudreux (farine) plutot qu'un depot fixe"],
    actions: ["Isoler la plante des autres pour limiter la propagation", "Ameliorer la circulation d'air", "Traiter au fongicide adapte ou bicarbonate dilue"],
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
    evidenceFor: ["Taches avec halo qui s'etendent dans le temps, evocateur d'une maladie fongique foliaire."],
    evidenceAgainst: [],
    verifications: ["Suivre l'evolution des taches sur quelques jours (photo a l'appui)"],
    actions: ["Retirer les feuilles les plus atteintes", "Eviter de mouiller le feuillage a l'arrosage", "Traiter au fongicide adapte si ca s'aggrave"],
  };
};

/** Choc de rempotage / acclimatation : acquisition recente, quasiment n'importe quel symptome. */
const repottingShock: Rule = (vector, ctx) => {
  if (ctx.daysSinceAcquired == null || ctx.daysSinceAcquired >= RECENT_ACQUISITION_THRESHOLD_DAYS) return null;

  return {
    id: "repotting_acclimation_shock",
    label: "Choc de rempotage / acclimatation",
    confidence: "PEU_PROBABLE",
    evidenceFor: [`Plante acquise il y a seulement ${ctx.daysSinceAcquired} jour(s) -- une periode d'acclimatation est encore plausible.`],
    evidenceAgainst: [],
    verifications: ["Comparer avec l'etat de la plante au moment de l'acquisition si des photos existent"],
    actions: ["Laisser le temps a la plante de s'acclimater (eviter les changements supplementaires)", "Maintenir un entretien standard et stable"],
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

/**
 * Ajoute (si pertinent) le resultat Pl@ntNet comme preuve POUR les
 * hypotheses deja generees par les regles, et renvoie separement les
 * candidats Pl@ntNet qui ne matchent aucune regle connue (pour leur creer
 * une hypothese dediee, cf computeHypotheses).
 */
function attachPlantnetEvidence(
  hypotheses: Hypothesis[],
  plantnetDisease: PlantnetDiseaseCandidate[] | null,
): { hypotheses: Hypothesis[]; unmatched: PlantnetDiseaseCandidate[] } {
  if (!plantnetDisease || plantnetDisease.length === 0) {
    return { hypotheses, unmatched: [] };
  }

  const unmatched: PlantnetDiseaseCandidate[] = [];
  const byId = new Map(hypotheses.map((h) => [h.id, h]));

  for (const candidate of plantnetDisease) {
    let matchedAny = false;
    for (const [hypothesisId, keywords] of Object.entries(PLANTNET_KEYWORDS)) {
      const hypothesis = byId.get(hypothesisId);
      if (hypothesis && matchesKeywords(candidate.name, keywords)) {
        hypothesis.evidenceFor.push(
          `Pl@ntNet suggere "${candidate.name}" (score ${Math.round(candidate.score * 100)}%) -- un signal parmi d'autres, pas une conclusion a lui seul.`,
        );
        matchedAny = true;
      }
    }
    if (!matchedAny) {
      unmatched.push(candidate);
    }
  }

  return { hypotheses, unmatched };
}

function unmatchedPlantnetHypothesis(candidate: PlantnetDiseaseCandidate): Hypothesis {
  return {
    id: `plantnet_${normalize(candidate.name).replace(/[^a-z0-9]+/g, "_")}`,
    label: `Suggestion Pl@ntNet : ${candidate.name}`,
    confidence: "POSSIBLE",
    evidenceFor: [`Pl@ntNet suggere "${candidate.name}" (score ${Math.round(candidate.score * 100)}%), sans correspondance avec une regle locale connue.`],
    evidenceAgainst: [],
    verifications: ["Rechercher ce nom pour confirmer les symptomes typiques associes"],
    actions: ["Comparer avec les symptomes observes avant d'agir", "Reprendre le diagnostic si cette piste ne correspond pas"],
  };
}

function fallbackHypothesis(): Hypothesis {
  return {
    id: "unknown_cause",
    label: "Cause non determinee avec les informations disponibles",
    confidence: "PEU_PROBABLE",
    evidenceFor: [],
    evidenceAgainst: [],
    verifications: ["Observer l'evolution sur quelques jours", "Verifier l'etat des racines et du substrat"],
    actions: ["Maintenir un entretien standard", "Reprendre le diagnostic si le symptome persiste ou s'aggrave"],
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

  const { hypotheses: withEvidence, unmatched } = attachPlantnetEvidence(triggered, plantnetDisease);
  const withUnmatched = [...withEvidence, ...unmatched.map(unmatchedPlantnetHypothesis)];

  if (withUnmatched.length === 0) {
    return [fallbackHypothesis()];
  }

  return sortByConfidence(withUnmatched);
}
