import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedSensor } from "@/server/ownership";
import { generateSensorApiKey } from "@/server/sensorAuth";

type Params = { params: Promise<{ id: string }> };

/** Regenere le jeton d'ingestion d'un capteur -- l'ancien devient immediatement invalide. */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedSensor(userId, id);

    const { plaintext, hash } = await generateSensorApiKey();
    await db.sensor.update({ where: { id }, data: { apiKeyHash: hash } });

    return NextResponse.json({ apiKey: plaintext });
  } catch (error) {
    return handleApiError(error);
  }
}
