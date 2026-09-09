import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { handleApiError } from "@/lib/apiError";
import { createReadingSchema } from "@/server/validation/sensor";
import { evaluateSensorReadingForTasks } from "@/server/careEngine/service";

type Params = { params: Promise<{ id: string }> };

/**
 * Point d'entrée pour un appareil (ESP32 ou équivalent) : pas de session
 * utilisateur possible sur un microcontrôleur -- authentification par la
 * clé propre au capteur (`apiKey`, header X-Sensor-Key), pas par cookie de
 * session. Chaque capteur a sa propre clé, révocable individuellement
 * (contrairement à un secret global partagé).
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const providedKey = request.headers.get("x-sensor-key");

    const sensor = await db.sensor.findUnique({ where: { id } });
    // Meme reponse que la cle soit absente/incorrecte ou que le capteur
    // n'existe pas : ne jamais confirmer l'existence d'un id a qui n'a pas
    // la bonne cle.
    if (!sensor || !providedKey || providedKey !== sensor.apiKey) {
      return NextResponse.json({ error: "Capteur introuvable ou cle invalide." }, { status: 404 });
    }

    const body = await request.json();
    const input = createReadingSchema.parse(body);

    const reading = await db.sensorReading.create({
      data: {
        sensorId: sensor.id,
        value: input.value,
        unit: input.unit,
        recordedAt: input.recordedAt ?? new Date(),
      },
    });

    await evaluateSensorReadingForTasks(sensor, reading);

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
