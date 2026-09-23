import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { assertCuttingsMarketplaceEnabled, cancelListing } from "@/server/cuttings/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    assertCuttingsMarketplaceEnabled();
    const userId = await requireUserId();
    const { id } = await params;
    await cancelListing(userId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
