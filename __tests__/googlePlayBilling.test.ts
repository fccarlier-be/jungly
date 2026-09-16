import { describe, expect, it } from "vitest";
import { evaluatePurchaseState } from "@/server/googlePlayBilling";

describe("evaluatePurchaseState", () => {
  it("refuse un achat non finalise (annule ou en attente)", () => {
    expect(evaluatePurchaseState(1, 1)).toBe("not_purchased"); // annule
    expect(evaluatePurchaseState(2, 1)).toBe("not_purchased"); // en attente
    expect(evaluatePurchaseState(null, 1)).toBe("not_purchased");
    expect(evaluatePurchaseState(undefined, 1)).toBe("not_purchased");
  });

  it("signale qu'un achat valide mais non acquitte doit etre acquitte", () => {
    expect(evaluatePurchaseState(0, 0)).toBe("valid_needs_ack");
  });

  it("accepte un achat valide deja acquitte sans le re-acquitter", () => {
    expect(evaluatePurchaseState(0, 1)).toBe("valid_acknowledged");
  });
});
