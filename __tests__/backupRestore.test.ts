import { describe, expect, it } from "vitest";
import { restoredRuleConfiguration } from "@/server/backupRestore";

describe("restoredRuleConfiguration", () => {
  const byName = new Map([["Engrais vert", "fert-importateur"]]);

  it("resout l'engrais par son nom parmi ceux du compte qui importe", () => {
    expect(restoredRuleConfiguration({ dosagePerLiter: 2, fertilizerId: "fert-origine" }, "Engrais vert", byName)).toEqual({
      dosagePerLiter: 2,
      fertilizerId: "fert-importateur",
    });
  });

  it("ne reprend jamais l'id du fichier (il pouvait designer l'engrais d'un autre compte)", () => {
    expect(restoredRuleConfiguration({ dosagePerLiter: 2, fertilizerId: "fert-d-un-autre-compte" }, null, byName)).toEqual({ dosagePerLiter: 2 });
    expect(restoredRuleConfiguration({ fertilizerId: "fert-d-un-autre-compte" }, "Engrais inconnu", byName)).toEqual({});
  });

  it("tolere une configuration absente", () => {
    expect(restoredRuleConfiguration(null, undefined, byName)).toEqual({});
  });
});
