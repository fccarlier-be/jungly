import { NextResponse } from "next/server";
import { hasValidInternalSecret } from "@/lib/internalAuth";
import { listAccounts } from "@/server/adminPanel";

export async function GET(request: Request) {
  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }
  const accounts = await listAccounts();
  return NextResponse.json({ accounts });
}
