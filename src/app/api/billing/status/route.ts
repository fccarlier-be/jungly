import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getPlanStatus } from "@/server/planLimit";
import { HOSTED_ACCESS_PRODUCT_ID } from "@/server/billingProducts";

/** Etat du palier gratuit pour le compte connecte -- Parametres et paywall. */
export async function GET() {
  try {
    const userId = await requireUserId();
    const status = await getPlanStatus(userId);
    return NextResponse.json({ ...status, productId: HOSTED_ACCESS_PRODUCT_ID });
  } catch (error) {
    return handleApiError(error);
  }
}
