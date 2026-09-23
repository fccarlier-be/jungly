import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { assertCuttingsMarketplaceEnabled } from "@/server/cuttings/service";
import { acknowledgeWarning } from "@/server/cuttings/moderation";

type Params = { params: Promise<{ id: string }> };

// Volontairement SANS le controle de suspension : un membre suspendu doit
// pouvoir acquitter l'avertissement qui vient de le suspendre.
export async function POST(_request: Request, { params }: Params) {
  try {
    assertCuttingsMarketplaceEnabled();
    const userId = await requireUserId();
    const { id } = await params;
    await acknowledgeWarning(userId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
