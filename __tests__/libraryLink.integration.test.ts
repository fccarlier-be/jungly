import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { findLibraryEntryId } from "@/server/libraryLink";
import { backupSchema } from "@/server/validation/backup";

describe("findLibraryEntryId (lien plante -> fiche apres import de sauvegarde)", () => {
  const suffix = `${Date.now()}`;
  const ids: string[] = [];

  afterAll(async () => {
    await db.plantLibraryEntry.deleteMany({ where: { id: { in: ids } } });
  });

  it("retrouve une fiche importee par (source, sourceId)", async () => {
    const entry = await db.plantLibraryEntry.create({
      data: { commonName: `Menthe ${suffix}`, source: "PLANTFOLIO", sourceId: `pf-${suffix}` },
    });
    ids.push(entry.id);
    const found = await findLibraryEntryId(db, { source: "PLANTFOLIO", sourceId: `pf-${suffix}`, commonName: "autre nom" });
    expect(found).toBe(entry.id);
  });

  it("retrouve une fiche LOCAL (sans sourceId) par ses noms", async () => {
    const entry = await db.plantLibraryEntry.create({
      data: { commonName: `Monstera ${suffix}`, scientificName: "Monstera deliciosa", source: "LOCAL" },
    });
    ids.push(entry.id);
    const found = await findLibraryEntryId(db, {
      source: "LOCAL",
      sourceId: null,
      commonName: `Monstera ${suffix}`,
      scientificName: "Monstera deliciosa",
    });
    expect(found).toBe(entry.id);
  });

  it("renvoie null quand le serveur ne connait pas la fiche", async () => {
    expect(await findLibraryEntryId(db, { source: "LOCAL", commonName: `Inconnue ${suffix}` })).toBeNull();
    expect(await findLibraryEntryId(db, { source: "OPENPLANTBOOK", sourceId: `nope-${suffix}`, commonName: "x" })).toBeNull();
  });

  it("le schema de sauvegarde accepte la reference de fiche et reste compatible avec les anciennes archives", () => {
    const base = { version: 1 as const, locations: [], fertilizers: [] };
    const plant = { name: "Menthe", careRules: [], careEvents: [], plantNotes: [], photos: [] };
    expect(
      backupSchema.safeParse({
        ...base,
        plants: [{ ...plant, libraryEntry: { source: "LOCAL", sourceId: null, commonName: "Menthe" }, libraryImageUrl: "/library-photos/a.jpg" }],
      }).success,
    ).toBe(true);
    expect(backupSchema.safeParse({ ...base, plants: [plant] }).success).toBe(true);
  });
});
