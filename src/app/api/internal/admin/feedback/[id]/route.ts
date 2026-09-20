import { NextRequest, NextResponse } from "next/server";
import { hasValidInternalSecret } from "@/lib/internalAuth";
import { handleApiError } from "@/lib/apiError";
import { deleteFeedback } from "@/server/adminPanel";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  try {
    const { id } = await params;
    await deleteFeedback(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
