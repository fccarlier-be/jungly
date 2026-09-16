import { afterEach, describe, expect, it, vi } from "vitest";
import { hasValidInternalSecret } from "@/lib/internalAuth";

function requestWithSecret(secret: string | null): Request {
  const headers = new Headers();
  if (secret !== null) headers.set("x-internal-secret", secret);
  return new Request("https://example.test/api/internal/admin/stats", { headers });
}

describe("hasValidInternalSecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepte le bon secret", () => {
    vi.stubEnv("JUNGLY_ADMIN_INTERNAL_SECRET", "le-bon-secret");
    expect(hasValidInternalSecret(requestWithSecret("le-bon-secret"))).toBe(true);
  });

  it("refuse un mauvais secret", () => {
    vi.stubEnv("JUNGLY_ADMIN_INTERNAL_SECRET", "le-bon-secret");
    expect(hasValidInternalSecret(requestWithSecret("un-autre-secret"))).toBe(false);
  });

  it("refuse un secret de longueur differente", () => {
    vi.stubEnv("JUNGLY_ADMIN_INTERNAL_SECRET", "le-bon-secret");
    expect(hasValidInternalSecret(requestWithSecret("court"))).toBe(false);
  });

  it("refuse une requete sans header", () => {
    vi.stubEnv("JUNGLY_ADMIN_INTERNAL_SECRET", "le-bon-secret");
    expect(hasValidInternalSecret(requestWithSecret(null))).toBe(false);
  });

  it("refuse si la variable d'environnement n'est pas configuree", () => {
    vi.stubEnv("JUNGLY_ADMIN_INTERNAL_SECRET", "");
    expect(hasValidInternalSecret(requestWithSecret("peu-importe"))).toBe(false);
  });
});
