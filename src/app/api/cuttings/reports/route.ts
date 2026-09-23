import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiError";
import { requireCuttingsUserId } from "@/server/cuttings/guard";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { createCuttingReportSchema } from "@/server/validation/cutting";
import { createReport } from "@/server/cuttings/reports";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireCuttingsUserId();

    // Un signalement est rare et grave -- jamais un moyen de harceler.
    const { allowed, retryAfterSeconds } = checkRateLimit(`cutting-report:${userId}`, 10, 60 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const input = createCuttingReportSchema.parse(await request.json());
    await createReport(userId, input);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
