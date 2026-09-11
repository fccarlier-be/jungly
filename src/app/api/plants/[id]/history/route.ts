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

const DEFAULT_HISTORY_LIMIT = 200;
const MAX_HISTORY_LIMIT = 500;

function parseLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HISTORY_LIMIT;
  }
  return Math.min(parsed, MAX_HISTORY_LIMIT);
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedPlant(userId, id);

    const typeFilter = parseEventType(request.nextUrl.searchParams.get("type"));
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

    // Une plante ancienne (ou restauree via import, jusqu'a 10000
    // evenements) peut accumuler beaucoup d'evenements -- pas de curseur de
    // pagination complet ici, aucun consommateur actuel n'en a besoin
    // (la fiche plante interroge careEvent directement avec take: 5).
    const events = await db.careEvent.findMany({
      where: { plantId: id, ...(typeFilter ? { type: typeFilter } : {}) },
      orderBy: { performedAt: "desc" },
      take: limit,
    });

    return NextResponse.json(events);
  } catch (error) {
    return handleApiError(error);
  }
}
