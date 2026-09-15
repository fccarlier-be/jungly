import { NextResponse } from "next/server";
import { requireAdminUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getAnalyticsSummary } from "@/server/analytics";

export async function GET() {
  try {
    await requireAdminUserId();
    const summary = await getAnalyticsSummary();
    return NextResponse.json(summary);
  } catch (error) {
    return handleApiError(error);
  }
}
