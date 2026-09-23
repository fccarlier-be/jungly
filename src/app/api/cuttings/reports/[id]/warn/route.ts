import { NextRequest, NextResponse } from "next/server";
import { requireAdminUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { warnMessageSchema } from "@/server/validation/cutting";
import { assertCuttingsMarketplaceEnabled } from "@/server/cuttings/service";
import { warnFromReport } from "@/server/cuttings/moderation";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    assertCuttingsMarketplaceEnabled();
    const adminId = await requireAdminUserId();
    const { id } = await params;
    const { message } = warnMessageSchema.parse(await request.json());
    const result = await warnFromReport(adminId, id, message);
    return NextResponse.json({ rank: result.rank, consequence: result.consequence, bannedUntil: result.bannedUntil });
  } catch (error) {
    return handleApiError(error);
  }
}
