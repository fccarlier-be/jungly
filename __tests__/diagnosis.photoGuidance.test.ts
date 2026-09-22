import { describe, expect, it } from "vitest";
import { getRequestedPhotos, shouldCallDiseaseId } from "@/server/diagnosis/photoGuidance";
import { SYMPTOM_CATEGORIES } from "@/server/diagnosis/types";

const PLANTNET_ORGANS = ["auto", "leaf", "flower", "fruit", "bark"];

describe("getRequestedPhotos", () => {
  it.each(SYMPTOM_CATEGORIES)("inclut toujours une photo generale requise pour %s", (category) => {
    const photos = getRequestedPhotos({ category, answers: {} });
    const general = photos.find((p) => p.id === "general");
    expect(general).toBeDefined();
    expect(general?.required).toBe(true);
    expect(general?.organ).toBe("auto");
  });

  it.each(SYMPTOM_CATEGORIES)("ne depasse jamais 5 photos au total (limite Pl@ntNet) pour %s", (category) => {
    const photos = getRequestedPhotos({ category, answers: {} });
    expect(photos.length).toBeLessThanOrEqual(5);
  });

  it.each(SYMPTOM_CATEGORIES)("n'utilise que des organes valides pour l'API Pl@ntNet pour %s", (category) => {
    const photos = getRequestedPhotos({ category, answers: {} });
    for (const photo of photos) {
      expect(PLANTNET_ORGANS).toContain(photo.organ);
    }
  });

  it.each(SYMPTOM_CATEGORIES)("les id de photo sont sans doublon pour %s", (category) => {
    const photos = getRequestedPhotos({ category, answers: {} });
    const ids = photos.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("YELLOW_LEAVES demande un gros plan de feuille en plus de la vue generale", () => {
    const photos = getRequestedPhotos({ category: "YELLOW_LEAVES", answers: {} });
    expect(photos.some((p) => p.organ === "leaf" && p.required)).toBe(true);
    expect(photos.length).toBeGreaterThan(1);
  });

  it("PESTS demande un gros plan requis et le dessous des feuilles en option", () => {
    const photos = getRequestedPhotos({ category: "PESTS", answers: {} });
    const optional = photos.filter((p) => !p.required);
    expect(optional.length).toBeGreaterThan(0);
  });

  it("FLOWERING_ISSUE demande une photo de fleur", () => {
    const photos = getRequestedPhotos({ category: "FLOWERING_ISSUE", answers: {} });
    expect(photos.some((p) => p.organ === "flower")).toBe(true);
  });

  it("ABNORMAL_GROWTH et OTHER ne demandent pas de photo au-dela de la vue generale", () => {
    for (const category of ["ABNORMAL_GROWTH", "OTHER"] as const) {
      const photos = getRequestedPhotos({ category, answers: {} });
      expect(photos).toHaveLength(1);
      expect(photos[0].id).toBe("general");
    }
  });
});

describe("shouldCallDiseaseId", () => {
  it("appelle l'identification de maladie pour les categories a signature visuelle", () => {
    expect(shouldCallDiseaseId("YELLOW_LEAVES")).toBe(true);
    expect(shouldCallDiseaseId("BROWN_LEAVES")).toBe(true);
    expect(shouldCallDiseaseId("SPOTS")).toBe(true);
    expect(shouldCallDiseaseId("PESTS")).toBe(true);
  });

  it("n'appelle pas l'identification de maladie pour les categories plutot liees a la conduite de culture", () => {
    expect(shouldCallDiseaseId("ABNORMAL_GROWTH")).toBe(false);
    expect(shouldCallDiseaseId("FLOWERING_ISSUE")).toBe(false);
    expect(shouldCallDiseaseId("OTHER")).toBe(false);
    expect(shouldCallDiseaseId("WILTING")).toBe(false);
    expect(shouldCallDiseaseId("DROPPING_LEAVES")).toBe(false);
  });
});
