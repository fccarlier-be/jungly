import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { assertCuttingsMarketplaceEnabled, listMyListings } from "@/server/cuttings/service";

export async function GET() {
  try {
    assertCuttingsMarketplaceEnabled();
    const userId = await requireUserId();
    const listings = await listMyListings(userId);
    return NextResponse.json(listings);
  } catch (error) {
    return handleApiError(error);
  }
}
