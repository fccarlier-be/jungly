import { NextResponse } from "next/server";

/**
 * Limiteur en memoire (compteur a fenetre fixe) : suffisant ici puisque
 * l'app tourne dans un seul conteneur (pas de scaling horizontal, pas de
 * Redis a operer pour un homelab mono-instance). Redemarrer le conteneur
 * reinitialise les compteurs, ce qui est acceptable pour cet usage.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let sweepCounter = 0;

/** Purge occasionnelle des entrees expirees, pour ne jamais laisser grossir la Map indefiniment. */
function sweepExpired(now: number) {
  if (++sweepCounter % 500 !== 0) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** `key` doit deja inclure le nom de la route (ex. "login:1.2.3.4") pour ne jamais partager un compteur entre deux usages differents. */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** IP telle que transmise par nginx-plantes (X-Real-IP, voir nginx/default.conf) ; "unknown" en dernier recours (ne bloque jamais la requete). */
export function getClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return "unknown";
}

export function rateLimitResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "Trop de tentatives, réessaie plus tard." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
