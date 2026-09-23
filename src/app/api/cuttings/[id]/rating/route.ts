import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { createCuttingRatingSchema } from "@/server/validation/cutting";
import { assertCuttingsMarketplaceEnabled, createRating } from "@/server/cuttings/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    assertCuttingsMarketplaceEnabled();
    const userId = await requireUserId();
    const { id } = await params;
    const input = createCuttingRatingSchema.parse(await request.json());
    await createRating(userId, id, input);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
