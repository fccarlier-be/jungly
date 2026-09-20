import { NextResponse } from "next/server";
import { hasValidInternalSecret } from "@/lib/internalAuth";
import { listFeedbackDetailed } from "@/server/adminPanel";

export async function GET(request: Request) {
  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }
  const feedback = await listFeedbackDetailed();
  return NextResponse.json({ feedback });
}
