import { describe, expect, it } from "vitest";
import { buildDefaultShareText, formatElapsed } from "@/lib/shareCard";
import { shareCardQuerySchema } from "@/server/validation/shareCard";

const d = (s: string) => new Date(`${s}T12:00:00`);

describe("formatElapsed", () => {
  it("choisit l'unite la plus parlante", () => {
    expect(formatElapsed(d("2026-09-25"), d("2026-09-25"))).toBe("moins d'un jour");
    expect(formatElapsed(d("2026-09-24"), d("2026-09-25"))).toBe("1 jour");
    expect(formatElapsed(d("2026-09-15"), d("2026-09-25"))).toBe("10 jours");
    expect(formatElapsed(d("2026-08-01"), d("2026-09-25"))).toBe("7 semaines");
    expect(formatElapsed(d("2026-01-20"), d("2026-09-25"))).toBe("8 mois");
    expect(formatElapsed(d("2025-09-25"), d("2026-09-25"))).toBe("1 an");
    expect(formatElapsed(d("2024-06-25"), d("2026-09-25"))).toBe("2 ans et 3 mois");
  });

  it("compte en mois calendaires (jour du mois pas encore atteint)", () => {
    expect(formatElapsed(d("2026-01-26"), d("2026-09-25"))).toBe("7 mois");
  });

  it("n'est jamais negative", () => {
    expect(formatElapsed(d("2026-09-26"), d("2026-09-25"))).toBe("moins d'un jour");
  });
});

describe("buildDefaultShareText", () => {
  const base = {
    name: "Monstera",
    scientificName: "Monstera deliciosa",
    since: d("2026-01-20"),
    waterings: 14,
    fertilizings: 3,
    healthLevel: "GOOD" as const,
    now: d("2026-09-25"),
  };

  it("presente la plante avec ses statistiques et son etat de sante", () => {
    expect(buildDefaultShareText({ ...base, mode: "single" })).toBe(
      "Je vous présente Monstera (Monstera deliciosa), dans ma jungle depuis 8 mois. Déjà arrosée 14 fois et nourrie 3 fois. État de santé : bonne. Suivie avec Jungly.",
    );
  });

  it("omet ce qui n'existe pas (aucun soin, aucun releve, pas de nom botanique)", () => {
    expect(buildDefaultShareText({ ...base, scientificName: null, waterings: 0, fertilizings: 0, healthLevel: null, mode: "single" })).toBe(
      "Je vous présente Monstera, dans ma jungle depuis 8 mois. Suivie avec Jungly.",
    );
  });

  it("mode avant/apres : ecart entre les deux photos", () => {
    const text = buildDefaultShareText({ ...base, mode: "beforeAfter", beforeDate: d("2026-03-12"), afterDate: d("2026-09-24") });
    expect(text.startsWith("Avant / après : Monstera (Monstera deliciosa), 6 mois d'écart entre ces deux photos.")).toBe(true);
  });
});

describe("shareCardQuerySchema", () => {
  it("accepte une carte simple, avec ou sans photo", () => {
    expect(shareCardQuerySchema.parse({ mode: "single", format: "square" })).toEqual({ mode: "single", format: "square" });
    expect(shareCardQuerySchema.parse({ mode: "single", format: "story", photo: "p1" }).mode).toBe("single");
  });

  it("exige deux photos differentes pour un avant/apres", () => {
    expect(() => shareCardQuerySchema.parse({ mode: "beforeAfter", format: "square", before: "p1" })).toThrow();
    expect(() => shareCardQuerySchema.parse({ mode: "beforeAfter", format: "square", before: "p1", after: "p1" })).toThrow();
    expect(shareCardQuerySchema.parse({ mode: "beforeAfter", format: "square", before: "p1", after: "p2" }).mode).toBe("beforeAfter");
  });

  it("refuse un format ou un mode inconnu", () => {
    expect(() => shareCardQuerySchema.parse({ mode: "single", format: "banner" })).toThrow();
    expect(() => shareCardQuerySchema.parse({ mode: "collage", format: "square" })).toThrow();
  });
});
