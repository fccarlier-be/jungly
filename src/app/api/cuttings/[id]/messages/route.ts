import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { sendCuttingMessageSchema } from "@/server/validation/cutting";
import { assertCuttingsMarketplaceEnabled, sendMessage } from "@/server/cuttings/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    assertCuttingsMarketplaceEnabled();
    const userId = await requireUserId();

    const { allowed, retryAfterSeconds } = checkRateLimit(`cutting-message:${userId}`, 60, 60 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const { id } = await params;
    const input = sendCuttingMessageSchema.parse(await request.json());
    await sendMessage(userId, id, input);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
