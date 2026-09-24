import { describe, expect, it } from "vitest";
import { sessionIsCurrent } from "@/lib/sessionVersion";

describe("sessionIsCurrent", () => {
  it("accepte un JWT dont la version correspond a celle du compte", () => {
    expect(sessionIsCurrent(3, 3)).toBe(true);
  });

  it("refuse un JWT emis avant une reinitialisation du mot de passe", () => {
    expect(sessionIsCurrent(4, 3)).toBe(false);
  });

  it("traite un JWT sans version (emis avant l'introduction du champ) comme la version 0", () => {
    expect(sessionIsCurrent(0, undefined)).toBe(true);
    expect(sessionIsCurrent(1, undefined)).toBe(false);
  });
});
