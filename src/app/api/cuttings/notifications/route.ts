import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import {
  assertCuttingsMarketplaceEnabled,
  countNewListingsSince,
  countUnreadMessages,
  markCuttingsSeen,
} from "@/server/cuttings/service";

export async function GET() {
  try {
    assertCuttingsMarketplaceEnabled();
    const userId = await requireUserId();
    const [newListings, unreadMessages] = await Promise.all([countNewListingsSince(userId), countUnreadMessages(userId)]);
    return NextResponse.json({ newListings, unreadMessages });
  } catch (error) {
    return handleApiError(error);
  }
}

// N'acquitte QUE les nouvelles annonces : un message non lu reste un vrai
// "a faire" tant qu'il n'est pas ouvert, "Ignorer" ne peut pas le masquer.
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
