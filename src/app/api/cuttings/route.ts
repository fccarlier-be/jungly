import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { createCuttingListingSchema } from "@/server/validation/cutting";
import { assertCuttingsMarketplaceEnabled, listOpenListings, createListing } from "@/server/cuttings/service";

export async function GET() {
  try {
    assertCuttingsMarketplaceEnabled();
    await requireUserId();
    const listings = await listOpenListings();
    return NextResponse.json(listings);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertCuttingsMarketplaceEnabled();
    const userId = await requireUserId();

    const { allowed, retryAfterSeconds } = checkRateLimit(`cutting-create:${userId}`, 20, 60 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const input = createCuttingListingSchema.parse(await request.json());
    const listing = await createListing(userId, input);
    return NextResponse.json(listing, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
