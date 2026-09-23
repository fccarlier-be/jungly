import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { assertCuttingsMarketplaceEnabled, countNewListingsSince, markCuttingsSeen } from "@/server/cuttings/service";

export async function GET() {
  try {
    assertCuttingsMarketplaceEnabled();
    const userId = await requireUserId();
    const count = await countNewListingsSince(userId);
    return NextResponse.json({ count });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST() {
  try {
    assertCuttingsMarketplaceEnabled();
    const userId = await requireUserId();
    await markCuttingsSeen(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
