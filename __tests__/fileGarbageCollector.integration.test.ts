import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/server/db";
import { collectOrphanFiles } from "@/server/fileGarbageCollector";

/**
 * Test d'integration reelle (vrais fichiers, vraie base) -- meme convention
 * que imageMirror.integration.test.ts, qui ecrit deja de vrais fichiers dans
 * public/uploads et public/library-photos et les nettoie individuellement
 * en fin de test.
 */
describe("collectOrphanFiles (integration reelle, filesystem + SQLite)", () => {
  const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
  const LIBRARY_PHOTOS_DIR = path.join(process.cwd(), "public", "library-photos");
  const OLD_DATE = new Date(Date.now() - 48 * 60 * 60 * 1000); // largement au-dela du delai de grace de 24h

  let userId: string;
  let libraryEntryId: string;
  const filesToCleanup: string[] = [];

  async function writeUpload(name: string, old: boolean): Promise<string> {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const filePath = path.join(UPLOAD_DIR, name);
    await writeFile(filePath, "contenu de test");
    if (old) await utimes(filePath, OLD_DATE, OLD_DATE);
    filesToCleanup.push(filePath);
    return filePath;
  }

  async function writeLibraryPhoto(name: string, old: boolean): Promise<string> {
    await mkdir(LIBRARY_PHOTOS_DIR, { recursive: true });
    const filePath = path.join(LIBRARY_PHOTOS_DIR, name);
    await writeFile(filePath, "contenu de test");
    if (old) await utimes(filePath, OLD_DATE, OLD_DATE);
    filesToCleanup.push(filePath);
    return filePath;
  }

  async function exists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  beforeAll(async () => {
    const user = await db.user.create({ data: { email: `test-gc-${Date.now()}@example.com`, passwordHash: "x" } });
    userId = user.id;
    const entry = await db.plantLibraryEntry.create({
      data: { commonName: "Test GC", careProfile: { imageUrl: "/library-photos/gc-referenced.jpg" } },
    });
    libraryEntryId = entry.id;
  });

  afterAll(async () => {
    await db.user.delete({ where: { id: userId } });
    await db.plantLibraryEntry.delete({ where: { id: libraryEntryId } });
    await Promise.all(filesToCleanup.map((f) => rm(f, { force: true })));
    await db.$disconnect();
  });

  it("supprime un fichier uploads orphelin (aucune reference) passe le delai de grace", async () => {
    const orphan = await writeUpload("gc-orphan-old.jpg", true);

    const result = await collectOrphanFiles();

    expect(result.uploads).toBeGreaterThanOrEqual(1);
    expect(await exists(orphan)).toBe(false);
  });

  it("ne supprime jamais un fichier uploads reference par une ligne Upload", async () => {
    const referenced = await writeUpload("gc-referenced.jpg", true);
    await db.upload.create({ data: { filename: "gc-referenced.jpg", userId } });

    await collectOrphanFiles();

    expect(await exists(referenced)).toBe(true);
    await db.upload.delete({ where: { filename: "gc-referenced.jpg" } });
  });

  it("ne supprime jamais un fichier uploads orphelin trop recent (delai de grace)", async () => {
    const tooRecent = await writeUpload("gc-orphan-recent.jpg", false);

    await collectOrphanFiles();

    expect(await exists(tooRecent)).toBe(true);
  });

  it("supprime un fichier library-photos orphelin passe le delai de grace", async () => {
    const orphan = await writeLibraryPhoto("gc-orphan-library.jpg", true);

    const result = await collectOrphanFiles();

    expect(result.libraryPhotos).toBeGreaterThanOrEqual(1);
    expect(await exists(orphan)).toBe(false);
  });

  it("ne supprime jamais un fichier library-photos reference par une fiche", async () => {
    const referenced = await writeLibraryPhoto("gc-referenced.jpg", true);

    await collectOrphanFiles();

    expect(await exists(referenced)).toBe(true);
  });
});
