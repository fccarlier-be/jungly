import dns from "node:dns/promises";
import net from "node:net";

/** URL refusee car jugee dangereuse a televerser depuis le serveur (SSRF). */
export class UnsafeExternalUrlError extends Error {}

/** Erreur de telechargement (HTTP non-ok, flux trop volumineux...). */
export class ExternalFetchError extends Error {}

function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b, c] = parts;
  if (a === 0) return true; // 0.0.0.0/8 -- "cet hote"
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 -- loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 -- CGNAT
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 -- link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 -- TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24 -- relais anycast 6to4
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 -- benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 -- TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 -- TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserve + 255.255.255.255
  return false;
}

function isPrivateOrReservedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  // Adresse IPv4-mappee (::ffff:a.b.c.d) -- revalider comme IPv4, une IP
  // "publique" en apparence IPv6 peut cacher une cible privee IPv4.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateOrReservedIPv4(mapped[1]);
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 -- unique local
  if (/^fe[89ab]/.test(normalized)) return true; // fe80::/10 -- link-local
  if (normalized.startsWith("ff")) return true; // ff00::/8 -- multicast
  return false;
}

/** true si l'IP est privee, loopback, link-local ou autrement reservee (jamais une cible legitime pour un mirroring serveur). */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateOrReservedIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateOrReservedIPv6(ip);
  return true; // format inattendu -- on refuse par prudence plutot que de laisser passer.
}

/**
 * Verifie qu'une URL http(s) ne pointe pas vers le reseau interne avant de
 * la televerser depuis le serveur (SSRF -- voir audit11.md, section 1) :
 * resout REELLEMENT le nom d'hote plutot que d'inspecter la chaine de l'URL
 * elle-meme, sans quoi un hote comme "evil.example" qui resout vers
 * 127.0.0.1 (ou toute IP privee) contournerait trivialement une simple
 * regexp. Rejette des qu'UNE SEULE des adresses resolues est privee -- un
 * hote a plusieurs enregistrements A/AAAA ne doit pas pouvoir se cacher
 * derriere une adresse publique presentee en premier.
 *
 * Fenetre residuelle assumee : fetch() refait ensuite sa propre resolution
 * DNS independante -- une attaque de DNS rebinding tres precise (TTL=0,
 * reponse differente entre les deux resolutions) pourrait en theorie
 * contourner cette verification. Fermer entierement cette fenetre
 * demanderait d'epingler l'IP validee via un dispatcher HTTP personnalise
 * (undici Agent + connect override) -- juge disproportionne pour une
 * application self-hosted a faible nombre d'utilisateurs, face au cas
 * pratique vise ici (URL statique pointant vers le reseau interne).
 */
export async function assertSafeExternalUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeExternalUrlError("URL invalide.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeExternalUrlError("Protocole non autorise.");
  }

  const hostname = parsed.hostname;
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new UnsafeExternalUrlError("Adresse IP privee ou reservee refusee.");
    }
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new UnsafeExternalUrlError("Resolution DNS impossible.");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateOrReservedIp(a.address))) {
    throw new UnsafeExternalUrlError("Cet hote resout vers une adresse privee ou reservee.");
  }
}

/**
 * Telecharge le corps d'une reponse HTTP en respectant une limite stricte,
 * en lisant le flux morceau par morceau plutot que via response.arrayBuffer()
 * (voir audit11.md, section 14) : arrayBuffer() charge integralement le
 * corps en memoire AVANT tout controle de taille -- un hote malveillant
 * peut annoncer un Content-Type valide puis envoyer bien plus que la limite
 * (Content-Length absent ou mensonger n'y change rien). Ici, la lecture est
 * annulee des que la limite est depassee, sans jamais accumuler plus que
 * necessaire en memoire.
 */
export async function fetchWithSizeLimit(
  url: string,
  maxBytes: number,
): Promise<{ buffer: Buffer; contentType: string | null }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ExternalFetchError(`Echec du telechargement (HTTP ${res.status}).`);
  }
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? null;

  if (!res.body) {
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new ExternalFetchError("Fichier trop volumineux.");
    }
    return { buffer: Buffer.from(arrayBuffer), contentType };
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ExternalFetchError("Fichier trop volumineux.");
    }
    chunks.push(value);
  }
  return { buffer: Buffer.concat(chunks), contentType };
}
