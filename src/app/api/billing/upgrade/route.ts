import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { upgradeHostedAccountSchema } from "@/server/validation/billing";
import { upgradeHostedAccount } from "@/server/billing";

/** Deblocage de l'offre illimitee sur un compte deja connecte, apres un achat Google Play reussi. */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();

    const { allowed, retryAfterSeconds } = checkRateLimit(`billing-upgrade:${getClientIp(request)}`, 10, 15 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const input = upgradeHostedAccountSchema.parse(await request.json());
    await upgradeHostedAccount(userId, input);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
