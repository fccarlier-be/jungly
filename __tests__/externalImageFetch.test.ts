import { describe, expect, it } from "vitest";
import { isPrivateOrReservedIp, assertSafeExternalUrl, UnsafeExternalUrlError } from "@/server/externalImageFetch";

describe("isPrivateOrReservedIp", () => {
  it("reconnait les plages privees/reservees IPv4 courantes", () => {
    const privateIps = [
      "0.0.0.0",
      "10.0.0.1",
      "10.255.255.255",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.0.0.1",
      "192.0.2.1",
      "192.88.99.1",
      "192.168.0.1",
      "192.168.255.255",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "255.255.255.255",
    ];
    for (const ip of privateIps) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(true);
    }
  });

  it("ne bloque pas des IPv4 publiques ordinaires", () => {
    const publicIps = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.0.1", "172.32.0.1", "100.63.255.255"];
    for (const ip of publicIps) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(false);
    }
  });

  it("reconnait les plages privees/reservees IPv6", () => {
    const privateIps = [
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      // Forme hexadecimale equivalente de ::ffff:127.0.0.1 / ::ffff:10.0.0.1
      // (audit12.md) : une regexp sur la forme decimale pointee seule ne la
      // reconnaissait pas -- c'est precisement pour cette classe de trou que
      // la classification delegue desormais a ipaddr.js.
      "::ffff:7f00:1",
      "::ffff:a00:1",
    ];
    for (const ip of privateIps) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(true);
    }
  });

  it("ne bloque pas des IPv6 publiques ordinaires", () => {
    expect(isPrivateOrReservedIp("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateOrReservedIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("refuse par prudence toute chaine qui n'est pas une IP reconnue", () => {
    expect(isPrivateOrReservedIp("pas-une-ip")).toBe(true);
  });
});

describe("assertSafeExternalUrl", () => {
  it("rejette un protocole autre que http/https", async () => {
    await expect(assertSafeExternalUrl("file:///etc/passwd")).rejects.toThrow(UnsafeExternalUrlError);
    await expect(assertSafeExternalUrl("ftp://example.com/x")).rejects.toThrow(UnsafeExternalUrlError);
  });

  it("rejette une URL malformee", async () => {
    await expect(assertSafeExternalUrl("pas-une-url")).rejects.toThrow(UnsafeExternalUrlError);
  });

  it("rejette une IP litterale privee dans l'URL, sans resolution DNS", async () => {
    await expect(assertSafeExternalUrl("http://127.0.0.1:9999/photo.jpg")).rejects.toThrow(UnsafeExternalUrlError);
    await expect(assertSafeExternalUrl("http://192.168.1.1/photo.jpg")).rejects.toThrow(UnsafeExternalUrlError);
    await expect(assertSafeExternalUrl("http://[::1]/photo.jpg")).rejects.toThrow(UnsafeExternalUrlError);
  });

  it("rejette localhost (resolution DNS vers une IP privee)", async () => {
    await expect(assertSafeExternalUrl("http://localhost:9999/photo.jpg")).rejects.toThrow(UnsafeExternalUrlError);
  });

  // example.com (reserve par l'IANA pour la documentation/les tests, voir
  // RFC 2606) plutot qu'un domaine reel de fournisseur -- garantit une
  // resolution DNS stable dans le temps, sans dependre de l'infrastructure
  // d'un tiers pour ce test.
  it("accepte un hote public reel", async () => {
    await expect(assertSafeExternalUrl("https://example.com/x.jpg")).resolves.toBeUndefined();
  });
});
