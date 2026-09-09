import { NextRequest, NextResponse } from "next/server";
import { CareEventType } from "@prisma/client";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedPlant } from "@/server/ownership";

type Params = { params: Promise<{ id: string }> };

function parseEventType(value: string | null): CareEventType | undefined {
  return value && (Object.values(CareEventType) as string[]).includes(value) ? (value as CareEventType) : undefined;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedPlant(userId, id);

    const typeFilter = parseEventType(request.nextUrl.searchParams.get("type"));

    const events = await db.careEvent.findMany({
      where: { plantId: id, ...(typeFilter ? { type: typeFilter } : {}) },
      orderBy: { performedAt: "desc" },
    });

    return NextResponse.json(events);
  } catch (error) {
    return handleApiError(error);
  }
}
