import { describe, expect, it } from "vitest";
import { registerSchema } from "@/server/validation/auth";

function input(password: string) {
  return { email: "test@example.com", password };
}

describe("registerSchema -- limite du mot de passe (72 octets, limite reelle de bcrypt)", () => {
  it("accepte un mot de passe de 72 octets", () => {
    expect(registerSchema.safeParse(input("a".repeat(72))).success).toBe(true);
  });

  it("rejette un mot de passe de 73 octets", () => {
    expect(registerSchema.safeParse(input("a".repeat(73))).success).toBe(false);
  });

  it("compte les octets UTF-8, pas les caracteres -- rejette un mot de passe accentue trop long en octets", () => {
    // 40 "é" = 40 caracteres mais 80 octets UTF-8 (2 octets chacun).
    expect(registerSchema.safeParse(input("é".repeat(40))).success).toBe(false);
  });

  it("accepte un mot de passe accentue dont l'encodage UTF-8 reste sous 72 octets", () => {
    // 36 "é" = 36 caracteres, 72 octets UTF-8 pile.
    expect(registerSchema.safeParse(input("é".repeat(36))).success).toBe(true);
  });
});
