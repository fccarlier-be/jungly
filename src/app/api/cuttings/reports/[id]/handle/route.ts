import { NextResponse } from "next/server";
import { requireAdminUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { assertCuttingsMarketplaceEnabled } from "@/server/cuttings/service";
import { markReportHandled } from "@/server/cuttings/reports";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    assertCuttingsMarketplaceEnabled();
    await requireAdminUserId();
    const { id } = await params;
    await markReportHandled(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
