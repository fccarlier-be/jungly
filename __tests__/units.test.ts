import { describe, expect, it } from "vitest";
import { formatDistanceMm, formatVolume, inputUnitToMm, mmToInputUnit } from "@/lib/units";

describe("formatDistanceMm", () => {
  it("metrique : cm au-dela de 10mm, mm en dessous", () => {
    expect(formatDistanceMm(5)).toBe("5 mm");
    expect(formatDistanceMm(120)).toBe("12 cm");
  });

  it("imperial : conversion en pouces", () => {
    expect(formatDistanceMm(254, "IMPERIAL")).toBe("10 in");
  });

  it("valeur nulle -> tiret, quel que soit le systeme", () => {
    expect(formatDistanceMm(null)).toBe("-");
    expect(formatDistanceMm(undefined, "IMPERIAL")).toBe("-");
  });
});

describe("formatVolume", () => {
  it("metrique : L au-dela de 1000ml, ml en dessous", () => {
    expect(formatVolume(500)).toBe("500 ml");
    expect(formatVolume(1500)).toBe("1,5 L");
  });

  it("imperial : fl oz, puis gal au-dela d'un gallon", () => {
    expect(formatVolume(500, "IMPERIAL")).toBe("16.9 fl oz");
    expect(formatVolume(4000, "IMPERIAL")).toBe("1.06 gal");
  });
});

describe("mmToInputUnit / inputUnitToMm (aller-retour sans derive)", () => {
  it("metrique : identite", () => {
    expect(mmToInputUnit(120, "METRIC")).toBe(120);
    expect(inputUnitToMm(120, "METRIC")).toBe(120);
  });

  it("imperial : conversion mm <-> pouces", () => {
    expect(mmToInputUnit(254, "IMPERIAL")).toBe(10);
    expect(inputUnitToMm(10, "IMPERIAL")).toBe(254);
  });
});
