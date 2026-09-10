import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError, ConflictError } from "@/lib/apiError";
import { pushSubscriptionSchema, unsubscribeSchema } from "@/server/validation/notification";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const input = pushSubscriptionSchema.parse(body);

    // Un endpoint est en principe unique au navigateur/appareil qui l'a
    // genere (Push API), mais rien ne le garantit cote serveur -- sans ce
    // controle, connaitre l'endpoint d'un abonnement existant suffisait a
    // se l'approprier silencieusement (l'upsert ecrasait userId sans
    // verifier le proprietaire actuel).
    const existing = await db.pushSubscription.findUnique({ where: { endpoint: input.endpoint }, select: { userId: true } });
    if (existing && existing.userId !== userId) {
      throw new ConflictError("Cet abonnement appartient déjà à un autre compte.");
    }

    await db.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      update: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth },
      create: { userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const input = unsubscribeSchema.parse(body);

    await db.pushSubscription.deleteMany({ where: { endpoint: input.endpoint, userId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
