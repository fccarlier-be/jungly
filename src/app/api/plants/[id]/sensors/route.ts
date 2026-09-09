import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedPlant } from "@/server/ownership";
import { createSensorSchema } from "@/server/validation/sensor";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedPlant(userId, id);

    const sensors = await db.sensor.findMany({
      where: { plantId: id },
      include: { readings: { orderBy: { recordedAt: "desc" }, take: 1 } },
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

    const sensor = await db.sensor.create({ data: { plantId: id, ...input } });
    return NextResponse.json(sensor, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
