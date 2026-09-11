import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { db } from "@/server/db";
import { fetchWithSizeLimit, ExternalFetchError } from "@/server/externalImageFetch";
import { mirrorLibraryImage, processAndStoreLibraryImage } from "@/server/libraryPhotos";
import { resolvePhotoUrl, processAndStoreUpload } from "@/server/uploads";

/**
 * Test d'integration reelle (vrai serveur HTTP local, vrai traitement Sharp,
 * vraie base) plutot que des mocks de fetch/sharp -- coherent avec le reste
 * de la suite (voir dueTasks.integration.test.ts).
 *
 * fetchWithSizeLimit() est teste ICI contre le serveur local (127.0.0.1),
 * separement de mirrorLibraryImage()/resolvePhotoUrl() : ces derniers
 * appellent maintenant assertSafeExternalUrl() en premier (voir
 * externalImageFetch.test.ts), qui REJETTE precisement les adresses
 * loopback/privees -- impossible de leur faire atteindre un serveur de test
 * local sans re-ouvrir la faille SSRF le temps du test. Le telechargement
 * et le traitement d'image sont donc verifies independamment (chacun avec
 * un vrai serveur/un vrai buffer), et la composition des deux dans
 * mirrorLibraryImage()/resolvePhotoUrl() est verifiee via le rejet SSRF
 * lui-meme, qui ne necessite aucun serveur.
 */
describe("fetchWithSizeLimit (integration reelle, serveur HTTP local)", () => {
  let server: Server;
  let baseUrl: string;
  let validJpeg: Buffer;

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
        res.writeHead(200, { "Content-Type": "image/jpeg" });
        res.end(Buffer.alloc(20 * 1024 * 1024));
      } else if (req.url === "/redirect.jpg") {
        // Simule une cible publique qui redirige vers une adresse interne --
        // audit12.md section 1 : sans redirect: "error", fetch() suivrait
        // silencieusement cette redirection, contournant assertSafeExternalUrl()
        // deja passee sur l'URL initiale.
        res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
        res.end();
      } else if (req.url === "/slow.jpg") {
        // N'envoie jamais la reponse : verifie que le timeout se declenche
        // plutot que de laisser la requete pendre indefiniment.
        // (aucun res.end() -- la connexion reste ouverte)
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

  it("telecharge une image valide en respectant la limite de taille", async () => {
    const { buffer, contentType } = await fetchWithSizeLimit(`${baseUrl}/photo.jpg`, 8 * 1024 * 1024);
    expect(contentType).toBe("image/jpeg");
    const metadata = await sharp(buffer).metadata();
    expect(metadata.width).toBe(4);
  });

  it("retourne le content-type meme pour un fichier non-image (le tri se fait chez l'appelant)", async () => {
    const { contentType } = await fetchWithSizeLimit(`${baseUrl}/not-an-image.txt`, 8 * 1024 * 1024);
    expect(contentType).toBe("text/plain");
  });

  it("interrompt le flux et rejette des que la limite est depassee, sans Content-Length prealable", async () => {
    await expect(fetchWithSizeLimit(`${baseUrl}/too-big.jpg`, 8 * 1024 * 1024)).rejects.toThrow(ExternalFetchError);
  });

  it("rejette une reponse 404", async () => {
    await expect(fetchWithSizeLimit(`${baseUrl}/absent.jpg`, 8 * 1024 * 1024)).rejects.toThrow(ExternalFetchError);
  });

  it("refuse de suivre une redirection HTTP (contournement SSRF, audit12.md)", async () => {
    await expect(fetchWithSizeLimit(`${baseUrl}/redirect.jpg`, 8 * 1024 * 1024)).rejects.toThrow(ExternalFetchError);
  });

  it("interrompt un telechargement qui ne repond jamais (timeout)", async () => {
    await expect(fetchWithSizeLimit(`${baseUrl}/slow.jpg`, 8 * 1024 * 1024, 200)).rejects.toThrow(ExternalFetchError);
  }, 2000);
});

describe("processAndStoreLibraryImage / processAndStoreUpload (integration reelle, vrai Sharp/DB/filesystem)", () => {
  let validJpeg: Buffer;
  const writtenLibraryPhotos: string[] = [];
  const writtenUploads: string[] = [];

  beforeAll(async () => {
    validJpeg = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 34, g: 74, b: 52 } } })
      .jpeg()
      .toBuffer();
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

  it("processAndStoreLibraryImage traite et stocke publiquement", async () => {
    const result = await processAndStoreLibraryImage(validJpeg);
    expect(result).toMatch(/^\/library-photos\/[0-9a-f-]+\.jpg$/);
    writtenLibraryPhotos.push(path.basename(result));

    const stored = await readFile(path.join(process.cwd(), "public", "library-photos", path.basename(result)));
    const metadata = await sharp(stored).metadata();
    expect(metadata.format).toBe("jpeg");
  });

  it("processAndStoreUpload traite, stocke et enregistre l'ownership", async () => {
    const user = await db.user.create({
      data: { email: `test-process-upload-${Date.now()}@example.com`, passwordHash: "x" },
    });
    try {
      const result = await processAndStoreUpload(validJpeg, user.id);
      expect(result).toMatch(/^\/uploads\/[0-9a-f-]+\.jpg$/);
      const filename = path.basename(result);
      writtenUploads.push(filename);

      const upload = await db.upload.findUnique({ where: { filename } });
      expect(upload?.userId).toBe(user.id);
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });
});

describe("mirrorLibraryImage / resolvePhotoUrl (garde-fous, aucun serveur requis)", () => {
  it("resolvePhotoUrl laisse passer null/undefined inchanges", async () => {
    expect(await resolvePhotoUrl("user-1", null)).toBeNull();
    expect(await resolvePhotoUrl("user-1", undefined)).toBeUndefined();
  });

  it("resolvePhotoUrl laisse passer une URL /library-photos/ sans verification", async () => {
    const result = await resolvePhotoUrl("user-1", "/library-photos/deja-mirroree.jpg");
    expect(result).toBe("/library-photos/deja-mirroree.jpg");
  });

  // SSRF (audit11.md section 1) : resolvePhotoUrl()/mirrorLibraryImage()
  // acceptaient auparavant n'importe quelle URL http(s) fournie par le
  // client et la televersaient sans verification -- un compte authentifie
  // pouvait ainsi faire sonder le reseau interne par le serveur. Ces tests
  // verifient que le rejet a bien lieu, PAS de mock reseau necessaire : le
  // rejet intervient avant toute tentative de connexion.
  it("resolvePhotoUrl refuse une URL pointant vers le loopback (SSRF)", async () => {
    const user = await db.user.create({
      data: { email: `test-ssrf-${Date.now()}@example.com`, passwordHash: "x" },
    });
    try {
      const dangerous = "http://127.0.0.1:1/photo.jpg";
      const result = await resolvePhotoUrl(user.id, dangerous);
      // Best-effort : l'URL d'origine est conservee (comme tout autre echec
      // de mirroring), mais AUCUN upload n'a ete cree a partir de cette
      // cible interne.
      expect(result).toBe(dangerous);
      const uploads = await db.upload.findMany({ where: { userId: user.id } });
      expect(uploads).toHaveLength(0);
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });

  it("resolvePhotoUrl refuse une URL pointant vers le reseau prive (SSRF)", async () => {
    const user = await db.user.create({
      data: { email: `test-ssrf-private-${Date.now()}@example.com`, passwordHash: "x" },
    });
    try {
      const result = await resolvePhotoUrl(user.id, "http://192.168.1.1/photo.jpg");
      expect(result).toBe("http://192.168.1.1/photo.jpg");
      const uploads = await db.upload.findMany({ where: { userId: user.id } });
      expect(uploads).toHaveLength(0);
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });

  it("resolvePhotoUrl refuse localhost (resolution DNS, pas seulement la chaine de l'URL)", async () => {
    const user = await db.user.create({
      data: { email: `test-ssrf-localhost-${Date.now()}@example.com`, passwordHash: "x" },
    });
    try {
      const result = await resolvePhotoUrl(user.id, "http://localhost:1/photo.jpg");
      expect(result).toBe("http://localhost:1/photo.jpg");
      const uploads = await db.upload.findMany({ where: { userId: user.id } });
      expect(uploads).toHaveLength(0);
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });

  it("mirrorLibraryImage refuse une URL pointant vers le loopback (SSRF)", async () => {
    const result = await mirrorLibraryImage("http://127.0.0.1:1/photo.jpg");
    expect(result).toBeNull();
  });
});
