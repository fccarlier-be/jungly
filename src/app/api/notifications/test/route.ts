import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { sendPushToUser } from "@/server/notifications/webPush";

/** Envoie immediatement une notification de test a l'utilisateur connecte, sur tous ses appareils abonnes. */
export async function POST() {
  try {
    const userId = await requireUserId();

    const subscriptionCount = await db.pushSubscription.count({ where: { userId } });
    if (subscriptionCount === 0) {
      return NextResponse.json(
        { error: "Aucun appareil abonne. Active d'abord les notifications sur cet appareil." },
        { status: 400 },
      );
    }

    const result = await sendPushToUser(userId, {
      title: "🌱 Jungly",
      body: "Notification de test -- si tu vois ceci, tout fonctionne !",
      url: "/",
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
