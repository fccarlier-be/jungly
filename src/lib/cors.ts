import { NextResponse } from "next/server";

/**
 * Les routes publiques /api/beta/* sont appelées depuis le site vitrine,
 * hébergé sur un domaine distinct de l'app (pas encore décidé à ce jour) --
 * ni cookie ni donnée sensible en jeu ici, un CORS ouvert est donc sans
 * risque et évite de coder en dur une origine qui changera.
 */
export const PUBLIC_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export function withPublicCors(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(PUBLIC_CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export function publicCorsPreflight(): NextResponse {
  return withPublicCors(new NextResponse(null, { status: 204 }));
}
