import { describe, expect, it } from "vitest";
import { createCareRuleSchema, recurrenceComboCheckSchema } from "@/server/validation/careRule";

describe("createCareRuleSchema -- combinaisons recurrenceType/interval/exactDate", () => {
  it("accepte FIXED_INTERVAL_DAYS avec interval", () => {
    const result = createCareRuleSchema.safeParse({
      plantId: "p1",
      type: "WATERING",
      enabled: true,
      recurrenceType: "FIXED_INTERVAL_DAYS",
      interval: 7,
    });
    expect(result.success).toBe(true);
  });

  it("rejette FIXED_INTERVAL_DAYS sans interval", () => {
    const result = createCareRuleSchema.safeParse({
      plantId: "p1",
      type: "WATERING",
      enabled: true,
      recurrenceType: "FIXED_INTERVAL_DAYS",
    });
    expect(result.success).toBe(false);
  });

  it("rejette INTERVAL_MONTHS sans interval sur une regle de fertilisation", () => {
    const result = createCareRuleSchema.safeParse({
      plantId: "p1",
      type: "FERTILIZING",
      enabled: true,
      recurrenceType: "INTERVAL_MONTHS",
    });
    expect(result.success).toBe(false);
  });

  it("accepte MANUAL sans interval", () => {
    const result = createCareRuleSchema.safeParse({
      plantId: "p1",
      type: "WATERING",
      enabled: true,
      recurrenceType: "MANUAL",
    });
    expect(result.success).toBe(true);
  });

  it("accepte EXACT_DATE sur REPOTTING avec configuration.exactDate", () => {
    const result = createCareRuleSchema.safeParse({
      plantId: "p1",
      type: "REPOTTING",
      enabled: true,
      recurrenceType: "EXACT_DATE",
      configuration: { exactDate: "2026-12-01" },
    });
    expect(result.success).toBe(true);
  });

  it("rejette EXACT_DATE sur REPOTTING sans configuration.exactDate", () => {
    const result = createCareRuleSchema.safeParse({
      plantId: "p1",
      type: "REPOTTING",
      enabled: true,
      recurrenceType: "EXACT_DATE",
    });
    expect(result.success).toBe(false);
  });

  it("rejette EXACT_DATE sur WATERING (non pris en charge)", () => {
    const result = createCareRuleSchema.safeParse({
      plantId: "p1",
      type: "WATERING",
      enabled: true,
      recurrenceType: "EXACT_DATE",
      configuration: { exactDate: "2026-12-01" },
    });
    expect(result.success).toBe(false);
  });
});

describe("recurrenceComboCheckSchema -- revalidation apres fusion PATCH", () => {
  it("rejette le passage a FIXED_INTERVAL_DAYS quand interval reste absent", () => {
    const result = recurrenceComboCheckSchema.safeParse({
      type: "WATERING",
      recurrenceType: "FIXED_INTERVAL_DAYS",
      interval: null,
      configuration: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepte le passage a MANUAL sans interval", () => {
    const result = recurrenceComboCheckSchema.safeParse({
      type: "WATERING",
      recurrenceType: "MANUAL",
      interval: null,
      configuration: null,
    });
    expect(result.success).toBe(true);
  });
});
