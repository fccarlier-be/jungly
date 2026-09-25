import { describe, expect, it } from "vitest";
import { encryptMessageBody, decryptMessageBody, decryptMessageBodyOrPlaceholder, UNREADABLE_MESSAGE } from "@/server/cuttings/crypto";

describe("cuttings/crypto (AES-256-GCM)", () => {
  it("dechiffre exactement le texte chiffre", () => {
    const plaintext = "Salut ! Toujours dispo pour la bouture de pothos ?";
    const encrypted = encryptMessageBody(plaintext);
    expect(decryptMessageBody(encrypted)).toBe(plaintext);
  });

  it("produit un IV different a chaque chiffrement (pas de reutilisation de nonce)", () => {
    const a = encryptMessageBody("meme texte");
    const b = encryptMessageBody("meme texte");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("refuse de dechiffrer si le authTag a ete altere (integrite)", () => {
    const encrypted = encryptMessageBody("texte original");
    const tampered = { ...encrypted, authTag: encryptMessageBody("autre texte").authTag };
    expect(() => decryptMessageBody(tampered)).toThrow();
  });

  it("refuse de dechiffrer si le ciphertext a ete altere", () => {
    const encrypted = encryptMessageBody("texte original");
    const tampered = { ...encrypted, ciphertext: encryptMessageBody("autre texte").ciphertext };
    expect(() => decryptMessageBody(tampered)).toThrow();
  });

  // Audit du 2026-09-25 : sans authTagLength, Node acceptait un tag tronque
  // (ici 4 octets, valide pour ce message) -- authentification affaiblie.
  it("refuse un authTag tronque, meme s'il correspond au debut du vrai tag", () => {
    const encrypted = encryptMessageBody("texte original");
    const truncated = Buffer.from(encrypted.authTag, "base64").subarray(0, 4).toString("base64");
    expect(() => decryptMessageBody({ ...encrypted, authTag: truncated })).toThrow();
  });

  it("decryptMessageBodyOrPlaceholder remplace un message illisible au lieu de lever", () => {
    const encrypted = encryptMessageBody("texte original");
    expect(decryptMessageBodyOrPlaceholder(encrypted)).toBe("texte original");
    const tampered = { ...encrypted, authTag: encryptMessageBody("autre").authTag };
    expect(decryptMessageBodyOrPlaceholder(tampered)).toBe(UNREADABLE_MESSAGE);
  });
});
