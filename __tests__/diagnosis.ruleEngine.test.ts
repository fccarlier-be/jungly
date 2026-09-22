import { describe, expect, it } from "vitest";
import { computeHypotheses } from "@/server/diagnosis/ruleEngine";
import type { LocalContext, QcmAnswers, SymptomCategory } from "@/server/diagnosis/types";

// Contexte neutre : aucun signal alarmant, aucune donnee manquante notable
// -- chaque test ne modifie que les champs pertinents pour rester lisible.
function neutralContext(overrides: Partial<LocalContext> = {}): LocalContext {
  return {
    wateringRuleIntervalDays: null,
    daysSinceLastWatering: null,
    wateringGapDays: null,
    fertilizingRuleIntervalDays: null,
    daysSinceLastFertilizing: null,
    recentHeatStress: false,
    recentColdSnap: false,
    exposureMismatch: null,
    substrate: null,
    substrateType: null,
    recentEvents: [],
    daysSinceAcquired: 365,
    ...overrides,
  };
}

function vector(category: SymptomCategory, answers: QcmAnswers = {}) {
  return { category, answers };
}

function findHypothesis(hypotheses: ReturnType<typeof computeHypotheses>, id: string) {
  return hypotheses.find((h) => h.id === id);
}

describe("computeHypotheses - sous-arrosage", () => {
  it("se declenche avec un retard d'arrosage et un symptome coherent (fletrissement, sol sec)", () => {
    const result = computeHypotheses({
      symptomVector: vector("WILTING", { soilMoisture: "dry" }),
      localContext: neutralContext({ wateringGapDays: 4 }),
      plantnetDisease: null,
    });
    const hypothesis = findHypothesis(result, "underwatering");
    expect(hypothesis).toBeDefined();
    expect(hypothesis?.confidence).toBe("PROBABLE");
    expect(hypothesis?.evidenceFor.length).toBeGreaterThan(0);
  });

  it("ne se declenche pas quand l'arrosage est a jour (contexte contraire)", () => {
    const result = computeHypotheses({
      symptomVector: vector("WILTING", { soilMoisture: "dry" }),
      localContext: neutralContext({ wateringGapDays: -2 }),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "underwatering")).toBeUndefined();
  });

  it("ne se declenche pas sans donnee de retard disponible (wateringGapDays null)", () => {
    const result = computeHypotheses({
      symptomVector: vector("WILTING", { soilMoisture: "dry" }),
      localContext: neutralContext({ wateringGapDays: null }),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "underwatering")).toBeUndefined();
  });

  it("ne se declenche pas si le sol est humide malgre le retard (symptome incoherent)", () => {
    const result = computeHypotheses({
      symptomVector: vector("WILTING", { soilMoisture: "moist" }),
      localContext: neutralContext({ wateringGapDays: 4 }),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "underwatering")).toBeUndefined();
  });
});

describe("computeHypotheses - sur-arrosage / pourriture racinaire", () => {
  it("se declenche avec un arrosage recent et un fletrissement malgre un sol humide", () => {
    const result = computeHypotheses({
      symptomVector: vector("WILTING", { soilMoisture: "moist" }),
      localContext: neutralContext({ daysSinceLastWatering: 1 }),
      plantnetDisease: null,
    });
    const hypothesis = findHypothesis(result, "overwatering_root_rot");
    expect(hypothesis).toBeDefined();
    expect(hypothesis?.verifications.join(" ")).toMatch(/odeur|texture/);
  });

  it("ne se declenche pas si le dernier arrosage est ancien", () => {
    const result = computeHypotheses({
      symptomVector: vector("WILTING", { soilMoisture: "moist" }),
      localContext: neutralContext({ daysSinceLastWatering: 10 }),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "overwatering_root_rot")).toBeUndefined();
  });
});

describe("computeHypotheses - carences", () => {
  it("carence en azote : vieilles feuilles, uniforme, nervures jaunes, fertilisation en retard", () => {
    const result = computeHypotheses({
      symptomVector: vector("YELLOW_LEAVES", { leafAge: "old", pattern: "uniform", veinColor: "yellowVeins" }),
      localContext: neutralContext({ fertilizingRuleIntervalDays: 30, daysSinceLastFertilizing: 90 }),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "nitrogen_deficiency")).toBeDefined();
  });

  it("pas de carence en azote si la fertilisation est a jour", () => {
    const result = computeHypotheses({
      symptomVector: vector("YELLOW_LEAVES", { leafAge: "old", pattern: "uniform", veinColor: "yellowVeins" }),
      localContext: neutralContext({ fertilizingRuleIntervalDays: 30, daysSinceLastFertilizing: 5 }),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "nitrogen_deficiency")).toBeUndefined();
  });

  it("chlorose ferrique : jeunes feuilles, nervures encore vertes", () => {
    const result = computeHypotheses({
      symptomVector: vector("YELLOW_LEAVES", { leafAge: "young", veinColor: "greenVeins" }),
      localContext: neutralContext(),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "iron_chlorosis")).toBeDefined();
  });
});

describe("computeHypotheses - senescence naturelle", () => {
  it("une seule vieille feuille jaunie, contexte neutre -> PROBABLE", () => {
    const result = computeHypotheses({
      symptomVector: vector("YELLOW_LEAVES", { leafAge: "old", affectedLeafCount: "single" }),
      localContext: neutralContext(),
      plantnetDisease: null,
    });
    const hypothesis = findHypothesis(result, "natural_senescence");
    expect(hypothesis).toBeDefined();
    expect(hypothesis?.confidence).toBe("PROBABLE");
  });

  it("plusieurs feuilles touchees -> pas de senescence naturelle", () => {
    const result = computeHypotheses({
      symptomVector: vector("YELLOW_LEAVES", { leafAge: "old", affectedLeafCount: "several" }),
      localContext: neutralContext(),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "natural_senescence")).toBeUndefined();
  });
});

describe("computeHypotheses - contexte climatique", () => {
  it("stress thermique recent + fletrissement", () => {
    const result = computeHypotheses({
      symptomVector: vector("WILTING", {}),
      localContext: neutralContext({ recentHeatStress: true }),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "heat_stress")).toBeDefined();
  });

  it("choc du froid + feuilles brunes", () => {
    const result = computeHypotheses({
      symptomVector: vector("BROWN_LEAVES", {}),
      localContext: neutralContext({ recentColdSnap: true }),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "cold_shock")).toBeDefined();
  });

  it("exces de lumiere + taches", () => {
    const result = computeHypotheses({
      symptomVector: vector("SPOTS", {}),
      localContext: neutralContext({ exposureMismatch: true }),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "light_burn")).toBeDefined();
  });

  it("manque de lumiere + croissance etiolee", () => {
    const result = computeHypotheses({
      symptomVector: vector("ABNORMAL_GROWTH", { growthType: "etiolated" }),
      localContext: neutralContext({ exposureMismatch: true }),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "low_light_etiolation")).toBeDefined();
  });
});

describe("computeHypotheses - parasites", () => {
  it("cochenilles : residu collant", () => {
    const result = computeHypotheses({
      symptomVector: vector("PESTS", { traceType: ["stickyResidue"] }),
      localContext: neutralContext(),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "mealybugs")).toBeDefined();
  });

  it("araignees rouges : fines toiles", () => {
    const result = computeHypotheses({
      symptomVector: vector("PESTS", { traceType: ["webbing"] }),
      localContext: neutralContext(),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "spider_mites")).toBeDefined();
  });

  it("pucerons : jeunes pousses", () => {
    const result = computeHypotheses({
      symptomVector: vector("PESTS", { location: "youngShoots" }),
      localContext: neutralContext(),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "aphids")).toBeDefined();
  });
});

describe("computeHypotheses - maladies fongiques", () => {
  it("oidium : taches blanches poudreuses", () => {
    const result = computeHypotheses({
      symptomVector: vector("SPOTS", { spotColor: "white", spotTexture: "powdery" }),
      localContext: neutralContext(),
      plantnetDisease: null,
    });
    const hypothesis = findHypothesis(result, "powdery_mildew");
    expect(hypothesis).toBeDefined();
    expect(hypothesis?.confidence).toBe("PROBABLE");
  });

  it("tache fongique : halo + extension", () => {
    const result = computeHypotheses({
      symptomVector: vector("SPOTS", { halo: "withHalo", evolution: "spreading" }),
      localContext: neutralContext(),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "fungal_leaf_spot")).toBeDefined();
  });
});

describe("computeHypotheses - choc de rempotage / acclimatation", () => {
  it("acquisition recente -> hypothese PEU_PROBABLE presente quel que soit le symptome", () => {
    const result = computeHypotheses({
      symptomVector: vector("OTHER", {}),
      localContext: neutralContext({ daysSinceAcquired: 5 }),
      plantnetDisease: null,
    });
    const hypothesis = findHypothesis(result, "repotting_acclimation_shock");
    expect(hypothesis).toBeDefined();
    expect(hypothesis?.confidence).toBe("PEU_PROBABLE");
  });

  it("acquisition ancienne -> pas de choc de rempotage", () => {
    const result = computeHypotheses({
      symptomVector: vector("OTHER", {}),
      localContext: neutralContext({ daysSinceAcquired: 400 }),
      plantnetDisease: null,
    });
    expect(findHypothesis(result, "repotting_acclimation_shock")).toBeUndefined();
  });
});

describe("computeHypotheses - fallback", () => {
  it("renvoie une hypothese generique honnete quand rien ne se declenche", () => {
    const result = computeHypotheses({
      symptomVector: vector("OTHER", {}),
      localContext: neutralContext({ daysSinceAcquired: 400 }),
      plantnetDisease: null,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("unknown_cause");
    expect(result[0].confidence).toBe("PEU_PROBABLE");
    expect(result[0].actions.length).toBeGreaterThan(0);
    expect(result[0].verifications.length).toBeGreaterThan(0);
  });

  it("ne renvoie jamais un tableau vide, meme sans aucun signal", () => {
    const result = computeHypotheses({
      symptomVector: vector("ABNORMAL_GROWTH", {}),
      localContext: neutralContext({ daysSinceAcquired: 400 }),
      plantnetDisease: null,
    });
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("computeHypotheses - tri par confiance", () => {
  it("trie PROBABLE > POSSIBLE > PEU_PROBABLE", () => {
    const result = computeHypotheses({
      symptomVector: vector("YELLOW_LEAVES", { leafAge: "old", affectedLeafCount: "single" }),
      localContext: neutralContext({ daysSinceAcquired: 5 }),
      plantnetDisease: null,
    });
    // Contient au moins natural_senescence (PROBABLE) et repotting shock (PEU_PROBABLE).
    const ranks = result.map((h) => h.confidence);
    const firstProbableIndex = ranks.indexOf("PROBABLE");
    const firstPeuProbableIndex = ranks.indexOf("PEU_PROBABLE");
    if (firstProbableIndex !== -1 && firstPeuProbableIndex !== -1) {
      expect(firstProbableIndex).toBeLessThan(firstPeuProbableIndex);
    }
    for (let i = 1; i < result.length; i++) {
      const prevRank = { PROBABLE: 3, POSSIBLE: 2, PEU_PROBABLE: 1 }[result[i - 1].confidence];
      const currRank = { PROBABLE: 3, POSSIBLE: 2, PEU_PROBABLE: 1 }[result[i].confidence];
      expect(prevRank).toBeGreaterThanOrEqual(currRank);
    }
  });

  it("a egalite de confiance, trie par nombre de preuves POUR decroissant", () => {
    // Deux hypotheses PESTS toutes deux POSSIBLE (mealybugs, spider_mites) :
    // seule mealybugs recoit une preuve Pl@ntNet supplementaire, elle doit
    // donc passer devant a egalite de confiance.
    const result = computeHypotheses({
      symptomVector: vector("PESTS", { traceType: ["stickyResidue", "webbing"] }),
      localContext: neutralContext(),
      plantnetDisease: [{ name: "Mealybug infestation", eppoCode: null, score: 0.8 }],
    });
    const mealybugs = findHypothesis(result, "mealybugs");
    const spiderMites = findHypothesis(result, "spider_mites");
    expect(mealybugs).toBeDefined();
    expect(spiderMites).toBeDefined();
    expect(mealybugs!.confidence).toBe(spiderMites!.confidence);
    expect(mealybugs!.evidenceFor.length).toBeGreaterThan(spiderMites!.evidenceFor.length);
    expect(result.indexOf(mealybugs!)).toBeLessThan(result.indexOf(spiderMites!));
  });
});

describe("computeHypotheses - integration Pl@ntNet", () => {
  it("un nom Pl@ntNet qui matche une regle devient une PREUVE de l'hypothese, pas une conclusion isolee", () => {
    const result = computeHypotheses({
      symptomVector: vector("PESTS", { traceType: ["stickyResidue"] }),
      localContext: neutralContext(),
      plantnetDisease: [{ name: "Mealybug infestation", eppoCode: null, score: 0.9 }],
    });
    const hypothesis = findHypothesis(result, "mealybugs");
    expect(hypothesis).toBeDefined();
    expect(hypothesis?.evidenceFor.some((e) => e.includes("Mealybug infestation"))).toBe(true);
    // Pas de hypothese "plantnet_*" separee puisque ca a matche une regle existante.
    expect(result.some((h) => h.id.startsWith("plantnet_"))).toBe(false);
  });

  it("un nom Pl@ntNet qui ne matche aucune regle connue devient sa propre hypothese POSSIBLE", () => {
    const result = computeHypotheses({
      symptomVector: vector("OTHER", {}),
      localContext: neutralContext({ daysSinceAcquired: 400 }),
      plantnetDisease: [{ name: "Xylella fastidiosa", eppoCode: "XYLEFA", score: 0.5 }],
    });
    const hypothesis = result.find((h) => h.id.startsWith("plantnet_"));
    expect(hypothesis).toBeDefined();
    expect(hypothesis?.confidence).toBe("POSSIBLE");
    expect(hypothesis?.label).toContain("Xylella fastidiosa");
  });

  it("plantnetDisease null ou vide n'ajoute aucune hypothese supplementaire", () => {
    const withNull = computeHypotheses({
      symptomVector: vector("PESTS", { traceType: ["stickyResidue"] }),
      localContext: neutralContext(),
      plantnetDisease: null,
    });
    const withEmpty = computeHypotheses({
      symptomVector: vector("PESTS", { traceType: ["stickyResidue"] }),
      localContext: neutralContext(),
      plantnetDisease: [],
    });
    expect(withNull.map((h) => h.id)).toEqual(withEmpty.map((h) => h.id));
  });
});
