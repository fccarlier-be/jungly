import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { updateNotificationPreferenceSchema } from "@/server/validation/notification";

export async function GET() {
  try {
    const userId = await requireUserId();
    const preference = await db.notificationPreference.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    return NextResponse.json(preference);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const input = updateNotificationPreferenceSchema.parse(body);

    const preference = await db.notificationPreference.upsert({
      where: { userId },
      update: input,
      create: { userId, ...input },
    });

    return NextResponse.json(preference);
  } catch (error) {
    return handleApiError(error);
  }
}
