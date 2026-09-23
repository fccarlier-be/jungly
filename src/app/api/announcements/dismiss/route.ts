import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { markAnnouncementSeen } from "@/server/announcements";

const dismissSchema = z.object({ announcementId: z.string().min(1) });

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const { announcementId } = dismissSchema.parse(await request.json());
    await markAnnouncementSeen(userId, announcementId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
