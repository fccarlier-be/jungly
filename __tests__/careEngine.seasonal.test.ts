import { describe, expect, it } from "vitest";
import { isMonthActive, pushToNextActiveWindow } from "@/server/careEngine/seasonal";

describe("isMonthActive", () => {
  it("sans fenetre definie, toujours active", () => {
    expect(isMonthActive({}, 1)).toBe(true);
    expect(isMonthActive({}, 12)).toBe(true);
  });

  it("fenetre mars->septembre (fertilisation active)", () => {
    const window = { activeFromMonth: 3, activeUntilMonth: 9 };
    expect(isMonthActive(window, 3)).toBe(true);
    expect(isMonthActive(window, 6)).toBe(true);
    expect(isMonthActive(window, 9)).toBe(true);
    expect(isMonthActive(window, 2)).toBe(false);
    expect(isMonthActive(window, 10)).toBe(false);
  });

  it("fenetre a cheval sur l'annee (ex. octobre->fevrier)", () => {
    const window = { activeFromMonth: 10, activeUntilMonth: 2 };
    expect(isMonthActive(window, 11)).toBe(true);
    expect(isMonthActive(window, 1)).toBe(true);
    expect(isMonthActive(window, 6)).toBe(false);
  });
});

describe("pushToNextActiveWindow", () => {
  it("ne modifie pas une date deja dans la fenetre active", () => {
    const window = { activeFromMonth: 3, activeUntilMonth: 9 };
    const date = new Date("2026-06-15T00:00:00Z");
    expect(pushToNextActiveWindow(date, window)).toEqual(date);
  });

  it("repousse une date hors saison au debut de la prochaine fenetre active (meme annee)", () => {
    const window = { activeFromMonth: 3, activeUntilMonth: 9 };
    const date = new Date("2026-01-15T00:00:00Z");
    const pushed = pushToNextActiveWindow(date, window);
    expect(pushed.getFullYear()).toBe(2026);
    expect(pushed.getMonth()).toBe(2); // mars = index 2
  });

  it("repousse a l'annee suivante si la fenetre active est deja passee", () => {
    const window = { activeFromMonth: 3, activeUntilMonth: 9 };
    const date = new Date("2026-11-01T00:00:00Z");
    const pushed = pushToNextActiveWindow(date, window);
    expect(pushed.getFullYear()).toBe(2027);
    expect(pushed.getMonth()).toBe(2);
  });
});
