import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { completeOnboarding } from "@/server/onboarding";

/** Marque la presentation de premier lancement comme vue -- appele a la derniere etape ET a "Passer". */
export async function POST() {
  try {
    const userId = await requireUserId();
    await completeOnboarding(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
