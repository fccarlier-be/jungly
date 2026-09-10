import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedPlant } from "@/server/ownership";
import { createSensorSchema } from "@/server/validation/sensor";
import { generateSensorApiKey } from "@/server/sensorAuth";

type Params = { params: Promise<{ id: string }> };

// apiKeyHash n'est jamais renvoye : le jeton en clair n'est visible qu'une
// fois, dans la reponse de creation/rotation.
const SENSOR_SELECT = { id: true, plantId: true, type: true, name: true, externalId: true, createdAt: true } as const;

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedPlant(userId, id);

    const sensors = await db.sensor.findMany({
      where: { plantId: id },
      select: { ...SENSOR_SELECT, readings: { orderBy: { recordedAt: "desc" }, take: 1 } },
    });

    return NextResponse.json(sensors);
  } catch (error) {
    return handleApiError(error);
  }
}

/** Enregistre un capteur sur une plante -- rattachement fait par l'utilisateur, pas par l'appareil lui-même. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedPlant(userId, id);

    const body = await request.json();
    const input = createSensorSchema.omit({ plantId: true }).parse(body);

    const { plaintext, hash } = await generateSensorApiKey();
    const sensor = await db.sensor.create({ data: { plantId: id, ...input, apiKeyHash: hash }, select: SENSOR_SELECT });
    // apiKey en clair : uniquement dans cette reponse, jamais persiste ni renvoye ensuite.
    return NextResponse.json({ ...sensor, apiKey: plaintext }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
