import { afterEach, describe, expect, it } from "vitest";
import { isRegistrationOpen } from "@/lib/registrationMode";

describe("isRegistrationOpen", () => {
  const original = process.env.REGISTRATION_MODE;

  afterEach(() => {
    if (original === undefined) delete process.env.REGISTRATION_MODE;
    else process.env.REGISTRATION_MODE = original;
  });

  it("est ouverte par defaut (variable absente)", () => {
    delete process.env.REGISTRATION_MODE;
    expect(isRegistrationOpen()).toBe(true);
  });

  it("est ouverte pour toute valeur autre que invite_only", () => {
    process.env.REGISTRATION_MODE = "open";
    expect(isRegistrationOpen()).toBe(true);
  });

  it("est fermee quand REGISTRATION_MODE=invite_only", () => {
    process.env.REGISTRATION_MODE = "invite_only";
    expect(isRegistrationOpen()).toBe(false);
  });
});
