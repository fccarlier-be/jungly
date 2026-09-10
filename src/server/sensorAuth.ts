import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Genere un nouveau jeton d'ingestion capteur (X-Sensor-Key) et son hash.
 * Le jeton en clair n'est jamais stocke -- a communiquer immediatement a
 * l'appelant (creation ou rotation), impossible a retrouver ensuite.
 */
export async function generateSensorApiKey(): Promise<{ plaintext: string; hash: string }> {
  const plaintext = randomBytes(24).toString("base64url");
  const hash = await bcrypt.hash(plaintext, 10);
  return { plaintext, hash };
}
