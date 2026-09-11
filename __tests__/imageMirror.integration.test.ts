import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { db } from "@/server/db";
import { mirrorLibraryImage } from "@/server/libraryPhotos";
import { resolvePhotoUrl } from "@/server/uploads";

/**
 * Test d'integration reelle (vrai serveur HTTP local, vrai traitement Sharp,
 * vraie base) plutot que des mocks de fetch/sharp -- coherent avec le reste
 * de la suite (voir dueTasks.integration.test.ts), et seul moyen d'attraper
 * un vrai bug de branchement content-type/taille/format.
 */
describe("mirrorLibraryImage / resolvePhotoUrl (integration reelle)", () => {
  let server: Server;
  let baseUrl: string;
  let validJpeg: Buffer;
  const writtenLibraryPhotos: string[] = [];
  const writtenUploads: string[] = [];

  beforeAll(async () => {
    validJpeg = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 34, g: 74, b: 52 } } })
      .jpeg()
      .toBuffer();

    server = createServer((req, res) => {
      if (req.url === "/photo.jpg") {
        res.writeHead(200, { "Content-Type": "image/jpeg" });
        res.end(validJpeg);
      } else if (req.url === "/not-an-image.txt") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("pas une image");
      } else if (req.url === "/too-big.jpg") {
        res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": String(20 * 1024 * 1024) });
        res.end(Buffer.alloc(20 * 1024 * 1024));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("adresse du serveur de test invalide");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  afterEach(async () => {
    for (const filename of writtenLibraryPhotos.splice(0)) {
      await rm(path.join(process.cwd(), "public", "library-photos", filename), { force: true });
    }
    for (const filename of writtenUploads.splice(0)) {
      await rm(path.join(process.cwd(), "public", "uploads", filename), { force: true });
      await db.upload.deleteMany({ where: { filename } });
    }
  });

  it("mirrorLibraryImage telecharge, traite et stocke une image valide", async () => {
    const result = await mirrorLibraryImage(`${baseUrl}/photo.jpg`);
    expect(result).toMatch(/^\/library-photos\/[0-9a-f-]+\.jpg$/);
    writtenLibraryPhotos.push(path.basename(result!));

    const stored = await readFile(path.join(process.cwd(), "public", "library-photos", path.basename(result!)));
    const metadata = await sharp(stored).metadata();
    expect(metadata.format).toBe("jpeg");
  });

  it("mirrorLibraryImage retourne null pour un content-type non supporte", async () => {
    const result = await mirrorLibraryImage(`${baseUrl}/not-an-image.txt`);
    expect(result).toBeNull();
  });

  it("mirrorLibraryImage retourne null pour un fichier trop volumineux", async () => {
    const result = await mirrorLibraryImage(`${baseUrl}/too-big.jpg`);
    expect(result).toBeNull();
  });

  it("mirrorLibraryImage retourne null pour une URL introuvable (404)", async () => {
    const result = await mirrorLibraryImage(`${baseUrl}/absent.jpg`);
    expect(result).toBeNull();
  });

  it("resolvePhotoUrl laisse passer null/undefined inchanges", async () => {
    expect(await resolvePhotoUrl("user-1", null)).toBeNull();
    expect(await resolvePhotoUrl("user-1", undefined)).toBeUndefined();
  });

  it("resolvePhotoUrl laisse passer une URL /library-photos/ sans verification", async () => {
    const result = await resolvePhotoUrl("user-1", "/library-photos/deja-mirroree.jpg");
    expect(result).toBe("/library-photos/deja-mirroree.jpg");
  });

  it("resolvePhotoUrl mirroire une URL externe en upload prive appartenant a l'utilisateur", async () => {
    const user = await db.user.create({
      data: { email: `test-photo-mirror-${Date.now()}@example.com`, passwordHash: "x" },
    });
    try {
      const result = await resolvePhotoUrl(user.id, `${baseUrl}/photo.jpg`);
      expect(result).toMatch(/^\/uploads\/[0-9a-f-]+\.jpg$/);
      const filename = path.basename(result!);
      writtenUploads.push(filename);

      const upload = await db.upload.findUnique({ where: { filename } });
      expect(upload?.userId).toBe(user.id);
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });

  it("resolvePhotoUrl garde l'URL externe d'origine si le telechargement echoue", async () => {
    const user = await db.user.create({
      data: { email: `test-photo-mirror-fail-${Date.now()}@example.com`, passwordHash: "x" },
    });
    try {
      const result = await resolvePhotoUrl(user.id, `${baseUrl}/absent.jpg`);
      expect(result).toBe(`${baseUrl}/absent.jpg`);
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });
});
