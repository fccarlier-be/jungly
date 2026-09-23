import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiError";
import { requireCuttingsUserId } from "@/server/cuttings/guard";
import { contestTransaction } from "@/server/cuttings/service";

type Params = { params: Promise<{ txId: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const userId = await requireCuttingsUserId();
    const { txId } = await params;
    await contestTransaction(userId, txId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
