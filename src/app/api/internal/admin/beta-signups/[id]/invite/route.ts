import { NextRequest, NextResponse } from "next/server";
import { hasValidInternalSecret } from "@/lib/internalAuth";
import { handleApiError } from "@/lib/apiError";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { sendBetaInviteSchema } from "@/server/validation/adminInternal";
import { sendBetaInvite } from "@/server/adminPanel";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  try {
    const { allowed, retryAfterSeconds } = checkRateLimit(`admin-invite:${getClientIp(request)}`, 30, 5 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const { id } = await params;
    const { playConsoleUrl } = sendBetaInviteSchema.parse(await request.json());
    await sendBetaInvite(id, playConsoleUrl);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
