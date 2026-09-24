import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { resolveUploadedFilePath } from "@/server/uploads";
import { resolveLibraryPhotoPath } from "@/server/libraryPhotos";
import type { BackupData } from "@/server/validation/backup";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

/**
 * Export complet des données de l'utilisateur, sous forme d'archive .zip
 * (data.json + les fichiers photo eux-mêmes sous uploads/) : un simple JSON
 * référençant des chemins `/uploads/...` ne donnait qu'un backup de
 * données, pas une vraie sauvegarde restaurable -- les photos étaient
 * cassées une fois importées sur un autre serveur. Les références
 * (emplacement, engrais) restent résolues par nom plutôt que par id
 * interne. Les abonnements push (spécifiques à un appareil) et les tâches
 * (état dérivé, régénéré par le CareEngine) ne sont volontairement pas
 * exportés.
 */
/**
 * Photo mirroree localement de la fiche de bibliotheque d'une plante SANS
 * photo propre : c'est celle que l'application affiche a la place. Sans elle
 * dans l'archive, la plante perd son image des qu'elle est importee sur un
 * serveur qui n'a pas cette fiche.
 */
function libraryImageOf(plant: { photoUrl: string | null; libraryEntry: { careProfile: unknown } | null }): string | null {
  if (plant.photoUrl) return null;
  const imageUrl = (plant.libraryEntry?.careProfile as { imageUrl?: string } | null)?.imageUrl;
  return imageUrl?.startsWith("/library-photos/") ? imageUrl : null;
}

export async function GET() {
  try {
    const userId = await requireUserId();

    // Requete lourde (jusqu'a 1000 readings/capteur, lecture de tous les
    // fichiers photo, compression ZIP) -- un usage repete en boucle fait
    // travailler Prisma/SQLite/le filesystem/Sharp/JSZip pour rien.
    const { allowed, retryAfterSeconds } = checkRateLimit(`export:${userId}`, 5, 60 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const [locations, fertilizers, plants, preference, weatherProfile] = await Promise.all([
      db.location.findMany({ where: { userId } }),
      db.fertilizer.findMany({ where: { userId } }),
      db.plant.findMany({
        where: { userId },
        include: {
          location: true,
          libraryEntry: true,
          careRules: true,
          careEvents: { orderBy: { performedAt: "asc" } },
          plantNotes: { orderBy: { createdAt: "asc" } },
          photos: { orderBy: { createdAt: "asc" } },
          sensors: { include: { readings: { orderBy: { recordedAt: "desc" }, take: 1000 } } },
        },
      }),
      db.notificationPreference.findUnique({ where: { userId } }),
      db.weatherProfile.findUnique({ where: { userId } }),
    ]);

    const fertilizerNameById = new Map(fertilizers.map((f) => [f.id, f.name]));

    const data: BackupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      locations: locations.map((l) => ({ name: l.name })),
      fertilizers: fertilizers.map((f) => ({
        name: f.name,
        manufacturer: f.manufacturer,
        type: f.type,
        nitrogen: f.nitrogen,
        phosphorus: f.phosphorus,
        potassium: f.potassium,
        defaultDosage: f.defaultDosage,
        dosageUnit: f.dosageUnit,
        notes: f.notes,
      })),
      plants: plants.map((p) => {
        const config = (rule: (typeof p.careRules)[number]) => rule.configuration as Record<string, unknown> | null;
        return {
          name: p.name,
          scientificName: p.scientificName,
          photoUrl: p.photoUrl,
          libraryEntry: p.libraryEntry
            ? {
                source: p.libraryEntry.source,
                sourceId: p.libraryEntry.sourceId,
                commonName: p.libraryEntry.commonName,
                scientificName: p.libraryEntry.scientificName,
              }
            : null,
          libraryImageUrl: libraryImageOf(p),
          locationName: p.location?.name ?? null,
          acquiredAt: p.acquiredAt,
          potShape: p.potShape,
          potDiameterMm: p.potDiameterMm,
          potLengthMm: p.potLengthMm,
          potWidthMm: p.potWidthMm,
          potHeightMm: p.potHeightMm,
          potMaterial: p.potMaterial,
          substrate: p.substrate,
          exposure: p.exposure,
          temperatureNote: p.temperatureNote,
          humidityNote: p.humidityNote,
          notes: p.notes,
          careRules: p.careRules.map((rule) => {
            const cfg = config(rule);
            const fertilizerId = cfg?.fertilizerId as string | undefined;
            return {
              type: rule.type,
              enabled: rule.enabled,
              recurrenceType: rule.recurrenceType,
              interval: rule.interval,
              configuration: cfg,
              fertilizerName: fertilizerId ? (fertilizerNameById.get(fertilizerId) ?? null) : null,
            };
          }),
          careEvents: p.careEvents.map((e) => ({
            type: e.type,
            performedAt: e.performedAt,
            quantity: e.quantity,
            unit: e.unit,
            metadata: e.metadata as Record<string, unknown> | null,
            note: e.note,
          })),
          plantNotes: p.plantNotes.map((n) => ({ content: n.content, category: n.category, photoUrl: n.photoUrl })),
          photos: p.photos.map((ph) => ph.url),
          sensors: p.sensors.map((s) => ({
            type: s.type,
            name: s.name,
            externalId: s.externalId,
            readings: s.readings.map((r) => ({ value: r.value, unit: r.unit, recordedAt: r.recordedAt })),
          })),
        };
      }),
      weatherProfile: weatherProfile
        ? {
            city: weatherProfile.city,
            latitude: weatherProfile.latitude,
            longitude: weatherProfile.longitude,
            wateringIntervalMultiplier: weatherProfile.wateringIntervalMultiplier,
          }
        : null,
      notificationPreference: preference
        ? {
            enabled: preference.enabled,
            notificationTime: preference.notificationTime,
            overdueEnabled: preference.overdueEnabled,
            advanceReminderDays: preference.advanceReminderDays,
          }
        : null,
    };

    // Fichiers physiques : uniquement ceux reellement references (couverture,
    // galerie, photos de note), jamais tout le dossier uploads (partage entre
    // utilisateurs). Un fichier deja absent du disque est ignore -- le JSON
    // reste complet, seule la photo correspondante manquera a la restauration.
    const referencedUrls = new Set<string>();
    for (const p of data.plants) {
      if (p.photoUrl) referencedUrls.add(p.photoUrl);
      if (p.libraryImageUrl) referencedUrls.add(p.libraryImageUrl);
      for (const url of p.photos) referencedUrls.add(url);
      for (const note of p.plantNotes) if (note.photoUrl) referencedUrls.add(note.photoUrl);
    }

    const zip = new JSZip();
    zip.file("data.json", JSON.stringify(data, null, 2));
    const uploadsFolder = zip.folder("uploads");
    // Les photos de bibliotheque (/library-photos/...) sont un mirroir
    // LOCAL a ce serveur (voir libraryPhotos.ts), jamais partage entre
    // instances -- sans les inclure ici aussi, une couverture
    // auto-assignee lors d'une identification (tres courant : beaucoup de
    // plantes n'ont jamais de vraie photo /uploads/) redevient un lien
    // mort des qu'importee sur un autre serveur (incident du 2026-09-21,
    // migration PWA -> beta Android).
    const libraryPhotosFolder = zip.folder("library-photos");
    for (const url of referencedUrls) {
      if (url.startsWith("/uploads/")) {
        const filename = path.basename(url);
        try {
          const buffer = await readFile(resolveUploadedFilePath(filename));
          uploadsFolder?.file(filename, buffer);
        } catch {
          // Fichier deja supprime du disque : on exporte quand meme le reste.
        }
        continue;
      }
      if (url.startsWith("/library-photos/")) {
        const filename = path.basename(url);
        try {
          const buffer = await readFile(resolveLibraryPhotoPath(filename));
          libraryPhotosFolder?.file(filename, buffer);
        } catch {
          // Fichier deja supprime du disque : on exporte quand meme le reste.
        }
      }
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="jungly-backup-${new Date().toISOString().slice(0, 10)}.zip"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
