import { NextResponse } from "next/server";
import { hasValidInternalSecret } from "@/lib/internalAuth";
import { listBetaSignupsDetailed } from "@/server/adminPanel";

export async function GET(request: Request) {
  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }
  const signups = await listBetaSignupsDetailed();
  return NextResponse.json({ signups });
}
