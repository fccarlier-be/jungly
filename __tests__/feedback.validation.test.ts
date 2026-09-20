import { describe, expect, it } from "vitest";
import { createFeedbackSchema } from "@/server/validation/feedback";

describe("createFeedbackSchema", () => {
  it("accepte un contenu non vide", () => {
    const r = createFeedbackSchema.safeParse({ content: "Un bug sur la page X." });
    expect(r.success).toBe(true);
  });

  it("retire les espaces superflus", () => {
    const r = createFeedbackSchema.safeParse({ content: "  Un retour.  " });
    expect(r.success && r.data.content).toBe("Un retour.");
  });

  it("rejette un contenu vide", () => {
    const r = createFeedbackSchema.safeParse({ content: "" });
    expect(r.success).toBe(false);
  });

  it("rejette un contenu ne contenant que des espaces", () => {
    const r = createFeedbackSchema.safeParse({ content: "   " });
    expect(r.success).toBe(false);
  });

  it("rejette un contenu au-dela de 4000 caracteres", () => {
    const r = createFeedbackSchema.safeParse({ content: "a".repeat(4001) });
    expect(r.success).toBe(false);
  });
});
