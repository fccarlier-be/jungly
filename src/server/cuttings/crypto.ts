import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Chiffrement au repos (pas de bout en bout) des messages prives du
 * don/echange de boutures -- AES-256-GCM, cle unique detenue par le
 * serveur (CUTTINGS_MESSAGE_ENCRYPTION_KEY). Protege contre une fuite de la
 * base de donnees ou une sauvegarde volee ; l'operateur du serveur reste
 * techniquement capable de dechiffrer (choix assume, voir la discussion
 * produit du 2026-09-23 -- l'alternative, du chiffrement de bout en bout,
 * exigerait une gestion de cles cote client hors de portee de ce projet).
 */

const ALGORITHM = "aes-256-gcm";
// Taille recommandee pour GCM (NIST SP 800-38D) -- ne pas changer sans
// migrer les messages deja stockes.
const IV_LENGTH_BYTES = 12;
// Tag complet (16 octets) exige au dechiffrement : sans authTagLength, Node
// accepte aussi un tag tronque (4 a 16 octets), ce qui affaiblit
// l'authentification du message (durcissement, audit du 2026-09-25).
const AUTH_TAG_LENGTH_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.CUTTINGS_MESSAGE_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("CUTTINGS_MESSAGE_ENCRYPTION_KEY absente : impossible de chiffrer/dechiffrer un message.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CUTTINGS_MESSAGE_ENCRYPTION_KEY doit decoder en exactement 32 octets en base64 (AES-256).");
  }
  return key;
}

export interface EncryptedMessageBody {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encryptMessageBody(plaintext: string): EncryptedMessageBody {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH_BYTES });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptMessageBody(payload: EncryptedMessageBody): string {
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, "base64"), { authTagLength: AUTH_TAG_LENGTH_BYTES });
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

export const UNREADABLE_MESSAGE = "[Message illisible]";

/**
 * Comme decryptMessageBody, mais un message indechiffrable (cle
 * CUTTINGS_MESSAGE_ENCRYPTION_KEY renouvelee, donnee corrompue) devient un
 * texte de remplacement au lieu d'une exception : sans ca, UN seul message
 * illisible faisait echouer toute l'annonce (500) et empechait meme de
 * signaler la conversation (audit du 2026-09-25).
 */
export function decryptMessageBodyOrPlaceholder(payload: EncryptedMessageBody): string {
  try {
    return decryptMessageBody(payload);
  } catch (error) {
    console.error("[cuttings] message indechiffrable :", error instanceof Error ? error.message : error);
    return UNREADABLE_MESSAGE;
  }
}
