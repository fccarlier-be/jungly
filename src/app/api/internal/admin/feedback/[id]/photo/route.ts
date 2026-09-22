import { NextRequest, NextResponse } from "next/server";
import { hasValidInternalSecret } from "@/lib/internalAuth";
import { handleApiError } from "@/lib/apiError";
import { getFeedbackPhoto } from "@/server/adminPanel";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const data = await getFeedbackPhoto(id);
    return new NextResponse(new Uint8Array(data), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
