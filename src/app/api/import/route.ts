import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { backupSchema, type BackupData } from "@/server/validation/backup";
import { ensurePendingTaskForRule } from "@/server/careEngine/service";
import { resolveUploadedFilePath, deleteUploadedFile } from "@/server/uploads";
import { generateSensorApiKey } from "@/server/sensorAuth";

/**
 * Restaure une sauvegarde (.zip produite par GET /api/export : data.json +
 * uploads/). Les emplacements/engrais sont rapprochés par nom (créés s'ils
 * n'existent pas) ; les plantes sont toujours créées en nouveaux
 * enregistrements (jamais de fusion/écrasement silencieux d'une plante
 * existante). Les tâches ne sont jamais importées telles quelles : chaque
 * règle active régénère sa propre tâche PENDING via le CareEngine. Les
 * capteurs importés reçoivent une clé API fraîche (l'ancienne ne survivrait
 * de toute façon pas à un changement de serveur) -- renvoyée une seule fois
 * dans la réponse, à reconfigurer sur l'appareil physique.
 */
export async function POST(request: NextRequest) {
  const writtenFiles: string[] = [];

  try {
    const userId = await requireUserId();

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier envoyé." }, { status: 400 });
    }

    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const dataEntry = zip.file("data.json");
    if (!dataEntry) {
      return NextResponse.json({ error: "Archive invalide : data.json introuvable." }, { status: 400 });
    }
    const rawData = JSON.parse(await dataEntry.async("string"));
    const data: BackupData = backupSchema.parse(rawData);

    // Nouveaux noms de fichiers (UUID frais) : evite toute collision avec
    // des fichiers deja presents sur le serveur cible. Un fichier reference
    // dans data.json mais absent de l'archive (backup partiel/corrompu)
    // n'est pas bloquant -- son URL reste telle quelle (photo cassee a
    // l'affichage, mais l'import du reste continue).
    const uploadsFolder = zip.folder("uploads");
    const filenameMap = new Map<string, string>();
    if (uploadsFolder) {
      const entries = Object.values(uploadsFolder.files).filter((entry) => !entry.dir);
      for (const entry of entries) {
        const originalName = path.basename(entry.name);
        const newName = `${randomUUID()}.jpg`;
        const buffer = await entry.async("nodebuffer");
        // Ecrits immediatement (avant la transaction Prisma) : si l'un des
        // fichiers echoue, on nettoie ceux deja ecrits et on abandonne tout
        // l'import plutot que de laisser une restauration partielle.
        await writeFile(resolveUploadedFilePath(newName), buffer);
        writtenFiles.push(newName);
        filenameMap.set(originalName, newName);
      }
    }

    function remapUrl<T extends string | null | undefined>(url: T): T {
      if (!url || !url.startsWith("/uploads/")) return url;
      const newName = filenameMap.get(path.basename(url));
      return (newName ? `/uploads/${newName}` : url) as T;
    }

    // timeout releve : une sauvegarde reelle (dizaines de plantes, regles,
    // evenements) executee sequentiellement peut depasser le defaut Prisma
    // de 5s pour une transaction interactive.
    const { importedPlants, sensorApiKeys } = await db.$transaction(
      async (tx) => {
        const locationIdByName = new Map<string, string>();
        for (const loc of data.locations) {
          const existing = await tx.location.findUnique({ where: { userId_name: { userId, name: loc.name } } });
          const record = existing ?? (await tx.location.create({ data: { userId, name: loc.name } }));
          locationIdByName.set(loc.name, record.id);
        }

        const fertilizerIdByName = new Map<string, string>();
        for (const fert of data.fertilizers) {
          const existing = await tx.fertilizer.findFirst({ where: { userId, name: fert.name } });
          const record =
            existing ??
            (await tx.fertilizer.create({
              data: {
                userId,
                name: fert.name,
                manufacturer: fert.manufacturer ?? undefined,
                type: fert.type ?? undefined,
                nitrogen: fert.nitrogen ?? undefined,
                phosphorus: fert.phosphorus ?? undefined,
                potassium: fert.potassium ?? undefined,
                defaultDosage: fert.defaultDosage ?? undefined,
                dosageUnit: fert.dosageUnit ?? undefined,
                notes: fert.notes ?? undefined,
              },
            }));
          fertilizerIdByName.set(fert.name, record.id);
        }

        let count = 0;
        const sensorApiKeys: Array<{ plantName: string; sensorName: string; apiKey: string }> = [];
        for (const p of data.plants) {
          const locationId = p.locationName ? locationIdByName.get(p.locationName) : undefined;

          const plant = await tx.plant.create({
            data: {
              userId,
              name: p.name,
              scientificName: p.scientificName ?? undefined,
              photoUrl: remapUrl(p.photoUrl) ?? undefined,
              locationId,
              acquiredAt: p.acquiredAt ?? undefined,
              potDiameterMm: p.potDiameterMm ?? undefined,
              potHeightMm: p.potHeightMm ?? undefined,
              potMaterial: p.potMaterial ?? undefined,
              substrate: p.substrate ?? undefined,
              exposure: p.exposure ?? undefined,
              temperatureNote: p.temperatureNote ?? undefined,
              humidityNote: p.humidityNote ?? undefined,
              notes: p.notes ?? undefined,
            },
          });

          for (const rule of p.careRules) {
            const configuration: Record<string, unknown> = { ...(rule.configuration ?? {}) };
            if (rule.fertilizerName) {
              const fertilizerId = fertilizerIdByName.get(rule.fertilizerName);
              if (fertilizerId) configuration.fertilizerId = fertilizerId;
            }

            const createdRule = await tx.plantCareRule.create({
              data: {
                plantId: plant.id,
                type: rule.type,
                enabled: rule.enabled,
                recurrenceType: rule.recurrenceType,
                interval: rule.interval ?? undefined,
                configuration: configuration as Prisma.InputJsonValue,
              },
            });

            if (createdRule.enabled) {
              await ensurePendingTaskForRule(createdRule, new Date(), tx);
            }
          }

          for (const event of p.careEvents) {
            await tx.careEvent.create({
              data: {
                plantId: plant.id,
                type: event.type,
                performedAt: event.performedAt,
                quantity: event.quantity ?? undefined,
                unit: event.unit ?? undefined,
                metadata: (event.metadata as Prisma.InputJsonValue | null) ?? undefined,
                note: event.note ?? undefined,
              },
            });
          }

          for (const note of p.plantNotes) {
            await tx.note.create({
              data: {
                plantId: plant.id,
                content: note.content,
                category: note.category,
                photoUrl: remapUrl(note.photoUrl) ?? undefined,
              },
            });
          }

          for (const url of p.photos) {
            const remapped = remapUrl(url);
            if (remapped) await tx.plantPhoto.create({ data: { plantId: plant.id, url: remapped } });
          }

          for (const sensor of p.sensors) {
            const { plaintext, hash } = await generateSensorApiKey();
            const createdSensor = await tx.sensor.create({
              data: { plantId: plant.id, type: sensor.type, name: sensor.name, externalId: sensor.externalId ?? undefined, apiKeyHash: hash },
            });
            sensorApiKeys.push({ plantName: p.name, sensorName: sensor.name, apiKey: plaintext });
            if (sensor.readings.length > 0) {
              await tx.sensorReading.createMany({
                data: sensor.readings.map((r) => ({ sensorId: createdSensor.id, value: r.value, unit: r.unit, recordedAt: r.recordedAt })),
              });
            }
          }

          count += 1;
        }

        if (data.weatherProfile) {
          await tx.weatherProfile.upsert({
            where: { userId },
            update: data.weatherProfile,
            create: { userId, ...data.weatherProfile },
          });
        }

        if (data.notificationPreference) {
          await tx.notificationPreference.upsert({
            where: { userId },
            update: data.notificationPreference,
            create: { userId, ...data.notificationPreference },
          });
        }

        return { importedPlants: count, sensorApiKeys };
      },
      { timeout: 30000 },
    );

    return NextResponse.json({ ok: true, importedPlants, sensorApiKeys });
  } catch (error) {
    // Nettoyage des fichiers deja ecrits sur disque si l'import echoue apres
    // coup (ex. validation Zod ou transaction Prisma en erreur) -- sans ca,
    // un import rate laissait des photos orphelines sur le disque.
    await Promise.all(writtenFiles.map((name) => deleteUploadedFile(`/uploads/${name}`)));
    return handleApiError(error);
  }
}
