import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { completeCuttingListingSchema } from "@/server/validation/cutting";
import { assertCuttingsMarketplaceEnabled, completeListing } from "@/server/cuttings/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    assertCuttingsMarketplaceEnabled();
    const userId = await requireUserId();
    const { id } = await params;
    const { completedWithUserId } = completeCuttingListingSchema.parse(await request.json());
    await completeListing(userId, id, completedWithUserId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
