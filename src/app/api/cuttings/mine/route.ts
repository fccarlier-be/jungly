import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiError";
import { requireCuttingsUserId } from "@/server/cuttings/guard";
import { listMyListings } from "@/server/cuttings/service";

export async function GET() {
  try {
    const userId = await requireCuttingsUserId();
    const listings = await listMyListings(userId);
    return NextResponse.json(listings);
  } catch (error) {
    return handleApiError(error);
  }
}
