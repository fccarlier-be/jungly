import { describe, expect, it } from "vitest";
import { encryptMessageBody, decryptMessageBody } from "@/server/cuttings/crypto";

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
});
