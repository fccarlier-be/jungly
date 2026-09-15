import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { handleApiError } from "@/lib/apiError";
import { pageViewSchema } from "@/server/validation/analytics";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { withPublicCors, publicCorsPreflight } from "@/lib/cors";

export function OPTIONS() {
  return publicCorsPreflight();
}

/** Ne garde que le nom d'hote du referrer (jamais le chemin ni la query, potentiellement identifiants/PII). */
function hostnameOnly(referrer: string | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { allowed, retryAfterSeconds } = checkRateLimit(`pageview:${getClientIp(request)}`, 60, 60 * 1000);
    if (!allowed) {
      return withPublicCors(rateLimitResponse(retryAfterSeconds));
    }

    const body = await request.json();
    const { path, referrer } = pageViewSchema.parse(body);

    await db.pageView.create({ data: { path, referrer: hostnameOnly(referrer) } });

    return withPublicCors(new NextResponse(null, { status: 204 }));
  } catch (error) {
    return withPublicCors(handleApiError(error));
  }
}
