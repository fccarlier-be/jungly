import { NextRequest, NextResponse } from "next/server";
import { hasValidInternalSecret } from "@/lib/internalAuth";
import { handleApiError } from "@/lib/apiError";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { betaSignupSchema } from "@/server/validation/betaSignup";
import { listBetaSignupsDetailed, createBetaSignupAndInvite } from "@/server/adminPanel";

export async function GET(request: Request) {
  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }
  const signups = await listBetaSignupsDetailed();
  return NextResponse.json({ signups });
}

export async function POST(request: NextRequest) {
  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  try {
    const { allowed, retryAfterSeconds } = checkRateLimit(`admin-create-signup:${getClientIp(request)}`, 30, 5 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const { email } = betaSignupSchema.parse(await request.json());
    const signup = await createBetaSignupAndInvite(email);
    return NextResponse.json({ signup }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
