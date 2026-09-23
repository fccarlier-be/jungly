import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiError";
import { requireCuttingsUserId } from "@/server/cuttings/guard";
import { countUnacknowledgedWarnings } from "@/server/cuttings/moderation";
import {
  countNewListingsSince,
  countRatingsToGive,
  countUnreadMessages,
  markCuttingsSeen,
} from "@/server/cuttings/service";

export async function GET() {
  try {
    const userId = await requireCuttingsUserId();
    const [newListings, unreadMessages, ratingsToGive, warnings] = await Promise.all([
      countNewListingsSince(userId),
      countUnreadMessages(userId),
      countRatingsToGive(userId),
      countUnacknowledgedWarnings(userId),
    ]);
    return NextResponse.json({ newListings, unreadMessages, ratingsToGive, warnings });
  } catch (error) {
    return handleApiError(error);
  }
}

// N'acquitte QUE les nouvelles annonces : un message non lu ou une note a
// donner reste un vrai "a faire", "Ignorer" ne peut pas le masquer.
export async function POST() {
  try {
    const userId = await requireCuttingsUserId();
    await markCuttingsSeen(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
