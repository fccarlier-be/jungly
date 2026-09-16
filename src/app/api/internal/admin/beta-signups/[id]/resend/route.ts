import { NextRequest, NextResponse } from "next/server";
import { hasValidInternalSecret } from "@/lib/internalAuth";
import { handleApiError } from "@/lib/apiError";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { resendBetaEmailSchema } from "@/server/validation/adminInternal";
import { resendBetaEmail } from "@/server/adminPanel";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  try {
    const { allowed, retryAfterSeconds } = checkRateLimit(`admin-resend:${getClientIp(request)}`, 30, 5 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const { id } = await params;
    const { template } = resendBetaEmailSchema.parse(await request.json());
    await resendBetaEmail(id, template);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
