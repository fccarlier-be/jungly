import { describe, expect, it } from "vitest";
import { createFeedbackSchema } from "@/server/validation/feedback";

const BASE = { summary: "La photo ne s'affiche pas", content: "Un bug sur la page X." };

describe("createFeedbackSchema", () => {
  it("accepte un resume et un contenu non vides", () => {
    const r = createFeedbackSchema.safeParse(BASE);
    expect(r.success).toBe(true);
  });

  it("retire les espaces superflus", () => {
    const r = createFeedbackSchema.safeParse({ ...BASE, summary: "  Résumé.  ", content: "  Un retour.  " });
    expect(r.success && r.data.summary).toBe("Résumé.");
    expect(r.success && r.data.content).toBe("Un retour.");
  });

  it("rejette un resume vide", () => {
    const r = createFeedbackSchema.safeParse({ ...BASE, summary: "" });
    expect(r.success).toBe(false);
  });

  it("rejette un resume au-dela de 120 caracteres", () => {
    const r = createFeedbackSchema.safeParse({ ...BASE, summary: "a".repeat(121) });
    expect(r.success).toBe(false);
  });

  it("rejette un contenu vide", () => {
    const r = createFeedbackSchema.safeParse({ ...BASE, content: "" });
    expect(r.success).toBe(false);
  });

  it("rejette un contenu ne contenant que des espaces", () => {
    const r = createFeedbackSchema.safeParse({ ...BASE, content: "   " });
    expect(r.success).toBe(false);
  });

  it("rejette un contenu au-dela de 4000 caracteres", () => {
    const r = createFeedbackSchema.safeParse({ ...BASE, content: "a".repeat(4001) });
    expect(r.success).toBe(false);
  });

  it("applique AUTRE et anonymous=false par defaut", () => {
    const r = createFeedbackSchema.safeParse(BASE);
    expect(r.success && r.data.topic).toBe("AUTRE");
    expect(r.success && r.data.anonymous).toBe(false);
  });

  it("accepte un theme valide et anonymous=true", () => {
    const r = createFeedbackSchema.safeParse({ ...BASE, topic: "TACHES", anonymous: true });
    expect(r.success).toBe(true);
  });

  it("rejette un theme inconnu", () => {
    const r = createFeedbackSchema.safeParse({ ...BASE, topic: "INCONNU" });
    expect(r.success).toBe(false);
  });

  it("accepte une capture d'ecran (photoUrl)", () => {
    const r = createFeedbackSchema.safeParse({ ...BASE, photoUrl: "/uploads/abc.jpg" });
    expect(r.success).toBe(true);
  });
});
