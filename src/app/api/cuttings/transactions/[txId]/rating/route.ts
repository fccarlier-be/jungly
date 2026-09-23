import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiError";
import { requireCuttingsUserId } from "@/server/cuttings/guard";
import { createCuttingRatingSchema } from "@/server/validation/cutting";
import { createRating } from "@/server/cuttings/service";

type Params = { params: Promise<{ txId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireCuttingsUserId();
    const { txId } = await params;
    const input = createCuttingRatingSchema.parse(await request.json());
    await createRating(userId, txId, input);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
