import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiError";
import { verifyPurchaseSchema } from "@/server/validation/billing";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { provisionHostedAccount } from "@/server/billing";

/** Appelee par l'app Android apres un achat Google Play reussi -- seul chemin de creation de compte sur l'offre hebergee. */
export async function POST(request: NextRequest) {
  try {
    const { allowed, retryAfterSeconds } = checkRateLimit(`verify-purchase:${getClientIp(request)}`, 10, 15 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const input = verifyPurchaseSchema.parse(await request.json());
    const account = await provisionHostedAccount(input);

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
