import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiError";
import { requireCuttingsUserId } from "@/server/cuttings/guard";
import { getListingDetail } from "@/server/cuttings/service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const userId = await requireCuttingsUserId();
    const { id } = await params;
    const listing = await getListingDetail(id, userId);
    return NextResponse.json(listing);
  } catch (error) {
    return handleApiError(error);
  }
}
