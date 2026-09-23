import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiError";
import { requireCuttingsUserId } from "@/server/cuttings/guard";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { createCuttingListingSchema } from "@/server/validation/cutting";
import { listOpenListings, createListing } from "@/server/cuttings/service";

export async function GET() {
  try {
    await requireCuttingsUserId();
    const listings = await listOpenListings();
    return NextResponse.json(listings);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireCuttingsUserId();

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
