import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { assertCuttingsMarketplaceEnabled, getListingDetail } from "@/server/cuttings/service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    assertCuttingsMarketplaceEnabled();
    const userId = await requireUserId();
    const { id } = await params;
    const listing = await getListingDetail(id, userId);
    return NextResponse.json(listing);
  } catch (error) {
    return handleApiError(error);
  }
}
