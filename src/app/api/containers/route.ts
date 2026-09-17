import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { createContainerSchema } from "@/server/validation/container";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

export async function GET() {
  try {
    const userId = await requireUserId();
    const containers = await db.container.findMany({
      where: { userId },
      include: { _count: { select: { plants: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(containers);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();

    // Meme ordre de grandeur que les autres creations de ressources
    // (locations, engrais -- audit4).
    const { allowed, retryAfterSeconds } = checkRateLimit(`container-create:${userId}`, 50, 60 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const body = await request.json();
    const input = createContainerSchema.parse(body);

    const container = await db.container.create({ data: { ...input, userId } });
    return NextResponse.json(container, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
