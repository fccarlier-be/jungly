import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiError";
import { requireCuttingsUserId } from "@/server/cuttings/guard";
import { markThreadReadSchema } from "@/server/validation/cutting";
import { markThreadRead } from "@/server/cuttings/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireCuttingsUserId();
    const { id } = await params;
    const { withUserId } = markThreadReadSchema.parse(await request.json());
    await markThreadRead(userId, id, withUserId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
