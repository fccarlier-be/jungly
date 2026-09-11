import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";

/** URL refusee car jugee dangereuse a televerser depuis le serveur (SSRF). */
export class UnsafeExternalUrlError extends Error {}

/** Erreur de telechargement (HTTP non-ok, redirection, timeout, flux trop volumineux...). */
export class ExternalFetchError extends Error {}

// Le serveur distant n'a aucune raison valable de monopoliser une requete
// utilisateur : une photo se telecharge en quelques secondes ou pas du tout.
const FETCH_TIMEOUT_MS = 10_000;

/**
 * true si l'IP est privee, loopback, link-local ou autrement reservee
 * (jamais une cible legitime pour un mirroring serveur) -- 'unicast' est la
 * SEULE categorie traitee comme publique (liste blanche plutot que liste
 * noire : une plage future/oubliee est refusee par defaut, pas acceptee par
 * defaut). Delegue a ipaddr.js plutot qu'un parseur maison : un classifieur
 * d'adresses IP a la main manque facilement des formes equivalentes (ex.
 * ::ffff:7f00:1, forme hexadecimale de ::ffff:127.0.0.1, qu'une regexp sur
 * la forme decimale pointee ne reconnait pas -- trouve par un audit externe
 * sur la version precedente de ce fichier).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.parse(ip);
  } catch {
    return true; // format inattendu -- on refuse par prudence plutot que de laisser passer.
  }
  if (addr.kind() === "ipv6") {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      addr = v6.toIPv4Address();
    }
  }
  return addr.range() !== "unicast";
}

/**
 * Verifie qu'une URL http(s) ne pointe pas vers le reseau interne avant de
 * la televerser depuis le serveur (SSRF -- voir audit11.md section 1) :
 * resout REELLEMENT le nom d'hote plutot que d'inspecter la chaine de l'URL
 * elle-meme, sans quoi un hote comme "evil.example" qui resout vers
 * 127.0.0.1 (ou toute IP privee) contournerait trivialement une simple
 * regexp. Rejette des qu'UNE SEULE des adresses resolues est privee -- un
 * hote a plusieurs enregistrements A/AAAA ne doit pas pouvoir se cacher
 * derriere une adresse publique presentee en premier.
 *
 * Fenetre residuelle assumee (documentee ici, voir audit12.md section
 * "DNS rebinding") : fetch() refait ensuite sa propre resolution DNS
 * independante -- une attaque de DNS rebinding tres precise (TTL=0,
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
  if (ipaddr.isValid(hostname)) {
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
 *
 * `redirect: "error"` (voir audit12.md, section 1) : sans ca, un hote dont
 * l'adresse initiale a ete validee par assertSafeExternalUrl() peut ensuite
 * rediriger (301/302) vers une cible interne jamais revalidee -- fetch()
 * suit les redirections par defaut. Jungly recupere des URLs d'images
 * connues (bibliotheque, providers), pas un crawler general : aucun besoin
 * legitime de suivre une redirection ici.
 *
 * `signal: AbortSignal.timeout(...)` : un hote distant renvoyant quelques
 * octets puis restant silencieux resterait sinon en dessous de la limite de
 * taille indefiniment, monopolisant la requete.
 */
export async function fetchWithSizeLimit(
  url: string,
  maxBytes: number,
  // Parametrable uniquement pour les tests (verifier le declenchement reel
  // du timeout sans attendre 10s) -- les appelants de production ne passent
  // jamais cette valeur, qui garde alors FETCH_TIMEOUT_MS.
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<{ buffer: Buffer; contentType: string | null }> {
  let res: Response;
  try {
    res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new ExternalFetchError(
      error instanceof Error && error.name === "AbortError"
        ? "Delai de telechargement depasse."
        : "Redirection refusee ou hote injoignable.",
    );
  }
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
