import { describe, expect, it } from "vitest";
import { getFollowUpQuestions } from "@/server/diagnosis/qcmTree";
import { SYMPTOM_CATEGORIES } from "@/server/diagnosis/types";

describe("getFollowUpQuestions", () => {
  it.each(SYMPTOM_CATEGORIES.filter((c) => c !== "OTHER"))("renvoie 2 a 4 questions courtes pour %s", (category) => {
    const questions = getFollowUpQuestions(category);
    expect(questions.length).toBeGreaterThanOrEqual(2);
    expect(questions.length).toBeLessThanOrEqual(4);
    for (const question of questions) {
      expect(question.id).toBeTruthy();
      expect(question.question.length).toBeGreaterThan(0);
      expect(question.options.length).toBeGreaterThanOrEqual(3);
      expect(question.options.length).toBeLessThanOrEqual(5);
      for (const option of question.options) {
        expect(option.id).toBeTruthy();
        expect(option.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("OTHER ne pose pas de question de suivi (tableau vide, on passe aux photos)", () => {
    expect(getFollowUpQuestions("OTHER")).toEqual([]);
  });

  it("les id de question sont stables et sans doublon au sein d'une categorie", () => {
    for (const category of SYMPTOM_CATEGORIES) {
      const ids = getFollowUpQuestions(category).map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("les id d'option sont sans doublon au sein d'une question", () => {
    for (const category of SYMPTOM_CATEGORIES) {
      for (const question of getFollowUpQuestions(category)) {
        const ids = question.options.map((o) => o.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it("YELLOW_LEAVES demande l'age des feuilles, la couleur des nervures et le motif", () => {
    const questions = getFollowUpQuestions("YELLOW_LEAVES");
    const ids = questions.map((q) => q.id);
    expect(ids).toContain("leafAge");
    expect(ids).toContain("veinColor");
    expect(ids).toContain("pattern");
  });

  it("PESTS a une question a choix multiple pour les types de traces", () => {
    const questions = getFollowUpQuestions("PESTS");
    const traceType = questions.find((q) => q.id === "traceType");
    expect(traceType?.multiple).toBe(true);
  });

  it("la plupart des questions ne sont pas a choix multiple", () => {
    const allQuestions = SYMPTOM_CATEGORIES.flatMap((c) => getFollowUpQuestions(c));
    const multipleCount = allQuestions.filter((q) => q.multiple).length;
    expect(multipleCount).toBeLessThan(allQuestions.length);
  });
});
