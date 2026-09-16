import { NextResponse } from "next/server";
import { hasValidInternalSecret } from "@/lib/internalAuth";
import { getAnalyticsSummary } from "@/server/analytics";

export async function GET(request: Request) {
  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }
  const summary = await getAnalyticsSummary();
  return NextResponse.json(summary);
}
