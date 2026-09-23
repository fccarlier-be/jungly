import { NextRequest, NextResponse } from "next/server";
import { requireAdminUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { createAnnouncementSchema } from "@/server/validation/announcement";
import { createAnnouncement } from "@/server/announcements";

export async function POST(request: NextRequest) {
  try {
    await requireAdminUserId();
    const input = createAnnouncementSchema.parse(await request.json());
    const announcement = await createAnnouncement(input);
    return NextResponse.json(announcement, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
