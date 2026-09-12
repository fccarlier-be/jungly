import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { handleApiError } from "@/lib/apiError";
import { createReadingSchema } from "@/server/validation/sensor";
import { evaluateSensorReadingForTasks } from "@/server/careEngine/service";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

// Meme raisonnement que DUMMY_PASSWORD_HASH dans auth.ts (audit pentest
// live du 2026-09-12, testplantes.fcold.org) : sans ce hash factice,
// bcrypt.compare() n'etait appele QUE si le capteur existait (sensor
// trouve avant le check), rendant la reponse mesurablement plus lente
// (~85-90ms de plus, confirme sur 10 echantillons sans chevauchement)
// pour un id de capteur existant qu'inexistant -- un timing side-channel
// permettant de deviner par mesure de temps si un id donne correspond a
// un vrai capteur, avant meme d'avoir la bonne cle.
const DUMMY_SENSOR_KEY_HASH = "$2a$10$B.N2OIxy6yOqM.ilcwP5U.9eALI9PPi0qzNaC7GIVvj.ln08ZPtHO";

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
    // bcrypt.compare() toujours appele (contre le hash factice si le
    // capteur n'existe pas) : meme reponse ET meme temps de reponse que la
    // cle soit absente/incorrecte ou que le capteur n'existe pas, jamais de
    // court-circuit qui laisserait deviner l'existence d'un id par le temps
    // de reponse.
    const valid = await bcrypt.compare(providedKey ?? "", sensor?.apiKeyHash ?? DUMMY_SENSOR_KEY_HASH);
    if (!sensor || !providedKey || !valid) {
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
