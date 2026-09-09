import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { createFertilizerSchema } from "@/server/validation/fertilizer";

export async function GET() {
  try {
    const userId = await requireUserId();
    const fertilizers = await db.fertilizer.findMany({ where: { userId }, orderBy: { name: "asc" } });
    return NextResponse.json(fertilizers);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const input = createFertilizerSchema.parse(body);

    const fertilizer = await db.fertilizer.create({ data: { ...input, userId } });
    return NextResponse.json(fertilizer, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
