import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { handleApiError } from "@/lib/apiError";
import { createReadingSchema } from "@/server/validation/sensor";
import { evaluateSensorReadingForTasks, evaluateSensorBatteryStatus } from "@/server/careEngine/service";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";

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
    // Par IP, avant toute lecture en base : borne aussi bien un capteur qui
    // s'emballe qu'une tentative de force brute sur X-Sensor-Key par id.
    const { allowed, retryAfterSeconds } = checkRateLimit(`sensor-reading:${getClientIp(request)}`, 60, 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const { id } = await params;
    const providedKey = request.headers.get("x-sensor-key");

    const sensor = await db.sensor.findUnique({ where: { id } });
    // Meme reponse que la cle soit absente/incorrecte ou que le capteur
    // n'existe pas : ne jamais confirmer l'existence d'un id a qui n'a pas
    // la bonne cle. bcrypt.compare() plutot qu'une egalite directe : la cle
    // n'est plus stockee en clair (apiKeyHash).
    if (!sensor || !providedKey || !(await bcrypt.compare(providedKey, sensor.apiKeyHash))) {
      return NextResponse.json({ error: "Capteur introuvable ou cle invalide." }, { status: 404 });
    }

    const body = await request.json();
    const input = createReadingSchema.parse(body);

    // value/unit absents : l'appareil est en charge (voir firmware/) et ne
    // remonte que sa telemetrie, pas de lecture d'humidite ce cycle-la.
    if (input.value !== undefined && input.unit !== undefined) {
      const reading = await db.sensorReading.create({
        data: {
          sensorId: sensor.id,
          value: input.value,
          unit: input.unit,
          recordedAt: input.recordedAt ?? new Date(),
        },
      });
      await evaluateSensorReadingForTasks(sensor, reading);
    }

    if (input.batteryPercent !== undefined || input.charging !== undefined) {
      const updated = await db.sensor.update({
        where: { id: sensor.id },
        data: {
          ...(input.batteryPercent !== undefined ? { batteryPercent: input.batteryPercent } : {}),
          ...(input.charging !== undefined ? { charging: input.charging } : {}),
          lastSeenAt: new Date(),
        },
      });
      if (input.batteryPercent !== undefined) {
        await evaluateSensorBatteryStatus(updated, input.batteryPercent);
      }
    } else {
      await db.sensor.update({ where: { id: sensor.id }, data: { lastSeenAt: new Date() } });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
