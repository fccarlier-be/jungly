import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { markThreadReadSchema } from "@/server/validation/cutting";
import { assertCuttingsMarketplaceEnabled, markThreadRead } from "@/server/cuttings/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    assertCuttingsMarketplaceEnabled();
    const userId = await requireUserId();
    const { id } = await params;
    const { withUserId } = markThreadReadSchema.parse(await request.json());
    await markThreadRead(userId, id, withUserId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
