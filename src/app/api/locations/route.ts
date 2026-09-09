import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { createLocationSchema } from "@/server/validation/location";

export async function GET() {
  try {
    const userId = await requireUserId();
    const locations = await db.location.findMany({ where: { userId }, orderBy: { name: "asc" } });
    return NextResponse.json(locations);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const input = createLocationSchema.parse(body);

    const location = await db.location.create({ data: { ...input, userId } });
    return NextResponse.json(location, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
