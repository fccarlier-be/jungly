import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { setPseudoSchema } from "@/server/validation/cutting";
import { assertCuttingsMarketplaceEnabled } from "@/server/cuttings/service";
import { setPseudo } from "@/server/cuttings/pseudo";

export async function PUT(request: NextRequest) {
  try {
    assertCuttingsMarketplaceEnabled();
    const userId = await requireUserId();

    // Un pseudo se choisit une fois, se corrige parfois -- jamais en boucle.
    const { allowed, retryAfterSeconds } = checkRateLimit(`cutting-pseudo:${userId}`, 10, 60 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const { pseudo } = setPseudoSchema.parse(await request.json());
    const saved = await setPseudo(userId, pseudo);
    return NextResponse.json({ pseudo: saved });
  } catch (error) {
    return handleApiError(error);
  }
}
