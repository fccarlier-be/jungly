import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { Prisma } from "@generated/prisma/client";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError, BadRequestError } from "@/lib/apiError";
import {
  backupSchema,
  MAX_ZIP_ENTRIES,
  MAX_UPLOAD_FILE_SIZE,
  MAX_TOTAL_DECOMPRESSED_SIZE,
  MAX_ZIP_FILE_SIZE,
  MAX_DATA_JSON_SIZE,
  type BackupData,
} from "@/server/validation/backup";
import { ensurePendingTaskForRule } from "@/server/careEngine/service";
import { resolveUploadedFilePath, deleteUploadedFile } from "@/server/uploads";
import { generateSensorApiKey } from "@/server/sensorAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

// Meme recadrage que /api/uploads (photo affichee au plus en bandeau large) :
// un import reste soumis aux memes bornes qu'un televersement normal.
const MAX_IMPORTED_IMAGE_DIMENSION = 1600;
const IMPORTED_IMAGE_JPEG_QUALITY = 82;

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

    // Une transaction d'import peut a elle seule traiter 1000 plantes/100
    // capteurs/50 Mio decompresses -- un usage repete en boucle reste
    // couteux pour SQLite meme borne par les quotas de creation individuels.
    const { allowed, retryAfterSeconds } = checkRateLimit(`import:${userId}`, 3, 60 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier envoyé." }, { status: 400 });
    }
    // Ne pas dependre uniquement de nginx (client_max_body_size) : verifie
    // aussi cote application.
    if (file.size > MAX_ZIP_FILE_SIZE) {
      return NextResponse.json({ error: "Archive trop volumineuse." }, { status: 400 });
    }

    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    // MAX_ZIP_ENTRIES ci-dessous ne compte que les entrees uploads/* -- une
    // archive peut contenir des milliers d'entrees hors de ce prefixe
    // (repertoires vides, fichiers jamais decompresses par ce code) tout en
    // restant sous MAX_ZIP_FILE_SIZE : JSZip les charge neanmoins toutes en
    // memoire des le loadAsync() ci-dessus. Controle sur la totalite de
    // zip.files, avant tout traitement du contenu.
    if (Object.values(zip.files).length > MAX_ZIP_ENTRIES) {
      return NextResponse.json({ error: `Trop d'entrées dans l'archive (max ${MAX_ZIP_ENTRIES}).` }, { status: 400 });
    }
    const dataEntry = zip.file("data.json");
    if (!dataEntry) {
      return NextResponse.json({ error: "Archive invalide : data.json introuvable." }, { status: 400 });
    }
    // Premier controle avant decompression, a partir des metadonnees du zip
    // (taille annoncee) -- second controle sur la taille reelle apres coup,
    // au cas ou l'en-tete mentirait sur la taille declaree.
    const declaredSize = (dataEntry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    if (typeof declaredSize === "number" && declaredSize > MAX_DATA_JSON_SIZE) {
      return NextResponse.json({ error: "data.json trop volumineux." }, { status: 400 });
    }
    const dataJsonString = await dataEntry.async("string");
    if (dataJsonString.length > MAX_DATA_JSON_SIZE) {
      return NextResponse.json({ error: "data.json trop volumineux." }, { status: 400 });
    }
    const rawData = JSON.parse(dataJsonString);
    const data: BackupData = backupSchema.parse(rawData);

    // Nouveaux noms de fichiers (UUID frais) : evite toute collision avec
    // des fichiers deja presents sur le serveur cible.
    const filenameMap = new Map<string, string>();
    {
      // zip.folder("uploads").files n'est PAS filtre au dossier : JSZip
      // partage la meme table de fichiers (chemins complets) entre le zip
      // racine et toute "vue" de sous-dossier -- filtrer explicitement sur
      // le prefixe de chemin, sinon data.json lui-meme se retrouve traite
      // comme une image a importer (et rejete par la validation sharp
      // ci-dessous, cassant tout import legitime).
      // entries est un sous-ensemble de zip.files, deja borne par
      // MAX_ZIP_ENTRIES plus haut -- pas besoin d'un second controle ici.
      const entries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.startsWith("uploads/"));

      let totalDecompressedSize = 0;
      for (const entry of entries) {
        const originalName = path.basename(entry.name);
        // Une entree a la fois (pas tout le zip decompresse en parallele) :
        // borne le pic memoire a la taille d'un seul fichier plutot qu'a la
        // somme de toutes. JSZip decompresse entierement en memoire (pas de
        // mode flux) -- dans le pire cas theorique (un seul fichier avec un
        // ratio DEFLATE extreme), CETTE ligne peut encore consommer
        // plusieurs centaines de Mo avant que le controle de taille
        // ci-dessous ne s'applique. Residuel accepte pour un usage homelab :
        // la taille de l'archive elle-meme reste plafonnee a 10 Mo par
        // nginx (client_max_body_size), ce qui borne le nombre d'entrees
        // pouvant chacune tenter ce pire cas.
        const buffer = await entry.async("nodebuffer");
        if (buffer.length > MAX_UPLOAD_FILE_SIZE) {
          throw new BadRequestError(`Fichier trop volumineux dans l'archive : ${originalName}.`);
        }
        totalDecompressedSize += buffer.length;
        if (totalDecompressedSize > MAX_TOTAL_DECOMPRESSED_SIZE) {
          throw new BadRequestError("Archive trop volumineuse une fois décompressée.");
        }

        let processed: Buffer;
        try {
          // Meme pipeline que /api/uploads : reoriente/recadre et rejette
          // tout ce qui n'est pas une image reellement decodable -- protege
          // aussi contre un fichier de contenu arbitraire deguise en .jpg.
          processed = await sharp(buffer)
            .rotate()
            .resize({
              width: MAX_IMPORTED_IMAGE_DIMENSION,
              height: MAX_IMPORTED_IMAGE_DIMENSION,
              fit: "inside",
              withoutEnlargement: true,
            })
            .jpeg({ quality: IMPORTED_IMAGE_JPEG_QUALITY })
            .toBuffer();
        } catch {
          throw new BadRequestError(`Fichier illisible comme image dans l'archive : ${originalName}.`);
        }

        const newName = `${randomUUID()}.jpg`;
        // Ecrits immediatement (avant la transaction Prisma) : si l'un des
        // fichiers echoue, on nettoie ceux deja ecrits et on abandonne tout
        // l'import plutot que de laisser une restauration partielle.
        await writeFile(resolveUploadedFilePath(newName), processed);
        writtenFiles.push(newName);
        filenameMap.set(originalName, newName);
      }
    }

    // Une reference /uploads/... dans data.json sans fichier correspondant
    // dans l'archive (backup partiel/corrompu, OU archive fabriquee a la
    // main par un utilisateur malveillant) ne doit JAMAIS etre conservee
    // telle quelle : ca permettrait de faire pointer une plante importee
    // vers le fichier physique d'un AUTRE utilisateur si son nom (un UUID)
    // est connu -- la route de service ne verifie que l'appartenance de la
    // plante, pas que le fichier a bien ete apporte par cet import precis.
    // On perd la photo (elle redevient null) plutot que de risquer ca.
    function remapUrl(url: string | null | undefined): string | null {
      if (!url || !url.startsWith("/uploads/")) return url ?? null;
      const newName = filenameMap.get(path.basename(url));
      return newName ? `/uploads/${newName}` : null;
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

          // Evenements restaures AVANT les regles/taches : ensurePendingTaskForRule
          // a besoin de connaitre le dernier soin reel (pas la date d'import)
          // pour calculer la bonne prochaine echeance -- sinon une restauration
          // decale silencieusement le calendrier de chaque regle a "aujourd'hui".
          const latestEventDateByType = new Map<string, Date>();
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
            const current = latestEventDateByType.get(event.type);
            if (!current || event.performedAt > current) {
              latestEventDateByType.set(event.type, event.performedAt);
            }
          }

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
              // Le dernier evenement du meme type de soin que la regle sert
              // de point de depart -- repli sur la date d'import si aucun
              // evenement de ce type n'a ete restaure (regle jamais honoree).
              const fromDate = latestEventDateByType.get(rule.type) ?? new Date();
              await ensurePendingTaskForRule(createdRule, fromDate, tx);
            }
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
