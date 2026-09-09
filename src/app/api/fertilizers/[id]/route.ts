import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedFertilizer } from "@/server/ownership";
import { createFertilizerSchema } from "@/server/validation/fertilizer";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedFertilizer(userId, id);

    const body = await request.json();
    const input = createFertilizerSchema.partial().parse(body);

    const fertilizer = await db.fertilizer.update({ where: { id }, data: input });
    return NextResponse.json(fertilizer);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedFertilizer(userId, id);

    await db.fertilizer.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
