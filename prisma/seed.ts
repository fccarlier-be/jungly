import { createHash } from "node:crypto";
import { Prisma } from "@generated/prisma/client";
import bcrypt from "bcryptjs";
import { LIBRARY_SEED_ENTRIES } from "./librarySeed";
import { mapPlantfolioEntry, type PlantfolioRawEntry } from "./plantfolioMapping";
import plantfolioData from "./plantfolioData.json";
import { buildTaskTitle } from "@/server/careEngine/taskGenerator";
import { db } from "@/server/db";

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function fingerprint(data: unknown): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

/**
 * Si l'empreinte des donnees sources n'a pas change depuis le dernier
 * deploiement, on saute entierement le reparcours (des centaines de
 * requetes SQLite sequentielles pour plantfolio) -- sinon chaque
 * redemarrage de conteneur repayait ce cout meme pour un changement de code
 * sans rapport avec la bibliotheque. `run` n'est appele que si l'empreinte a
 * change, et son retour (comptes/mots crees-mis a jour) sert au log.
 */
async function seedIfChanged(key: string, sourceData: unknown, run: () => Promise<string>): Promise<void> {
  const hash = fingerprint(sourceData);
  const previous = await db.seedFingerprint.findUnique({ where: { key } });
  if (previous?.hash === hash) {
    console.log(`Bibliothèque (${key}) : inchangée depuis le dernier déploiement, seed ignoré.`);
    return;
  }
  const summary = await run();
  console.log(summary);
  await db.seedFingerprint.upsert({ where: { key }, update: { hash }, create: { key, hash } });
}

/**
 * Seed la bibliothèque de plantes. Toujours exécuté, même si l'utilisateur a
 * déjà des plantes -- contrairement au seed de démo ci-dessous, la
 * bibliothèque doit rester à jour indépendamment des données personnelles
 * de l'utilisateur. Synchronisée par `scientificName` : une entrée déjà
 * présente est mise à jour (pas seulement créée si absente), pour que les
 * améliorations du profil (ex. correction d'une photo) se propagent aux
 * installations existantes à chaque déploiement.
 */
async function seedLibrary() {
  await seedIfChanged("library", LIBRARY_SEED_ENTRIES, async () => {
    let created = 0;
    let updated = 0;
    for (const entry of LIBRARY_SEED_ENTRIES) {
      const data = {
        commonName: entry.commonName,
        scientificName: entry.scientificName,
        family: entry.family,
        careProfile: entry.careProfile as unknown as Prisma.InputJsonValue,
      };
      const existing = await db.plantLibraryEntry.findFirst({ where: { scientificName: entry.scientificName } });
      if (existing) {
        await db.plantLibraryEntry.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        await db.plantLibraryEntry.create({ data });
        created += 1;
      }
    }
    return `Bibliothèque de plantes : ${created} créée(s), ${updated} mise(s) à jour (${LIBRARY_SEED_ENTRIES.length} au total).`;
  });
}

/**
 * Enrichit la bibliothèque avec le dataset plantfolio-common-plants (952
 * plantes, CC BY-NC-SA 4.0 -- voir `plantfolioMapping.ts`). Import statique
 * (fichier JSON versionné, pas d'appel réseau), synchronisé par
 * `source`+`sourceId` : réimporter met à jour la fiche existante au lieu
 * d'en créer une deuxième.
 */
// Entrees dont le texte source ("Various lichen species...", "Sheet moss,
// Sphagnum moss...", "Broccoli sprouts, Alfalfa sprouts...") ressemble
// assez a un binome latin pour tromper `extractScientificName` (ex. "Sheet
// moss" -> genre="Sheet", espece="moss") mais n'en est pas un -- verifie
// manuellement, aucune des trois ne designe une espece precise de toute
// facon (categories generiques). Exclusion definitive plutot qu'un nom
// scientifique invente.
const PLANTFOLIO_EXCLUDE_IDS = new Set(["lichen", "mosses", "sprouts-microgreens"]);

// A incrementer manuellement si `mapPlantfolioEntry`, `PLANTFOLIO_EXCLUDE_IDS`
// ou la logique de dedoublonnage ci-dessous change : ces changements de code
// ne se reflètent dans aucune donnee source, donc l'empreinte ne les
// detecterait pas sans ce marqueur explicite.
const PLANTFOLIO_SEED_LOGIC_VERSION = "v1";

async function seedPlantfolio() {
  // Le premier element du fichier distribue est un objet `_metadata`
  // (version, liste des categories), pas une plante -- on le filtre.
  const entries = (plantfolioData as unknown as PlantfolioRawEntry[]).filter(
    (e) => e.id && e.typeName && !PLANTFOLIO_EXCLUDE_IDS.has(e.id),
  );

  // La logique ci-dessous depend aussi des entrees LOCAL en base (issues de
  // seedLibrary) pour eviter les doublons -- un changement de
  // LIBRARY_SEED_ENTRIES doit donc invalider ce cache autant qu'un
  // changement de plantfolioData.json lui-meme.
  const fingerprintInput = { version: PLANTFOLIO_SEED_LOGIC_VERSION, plantfolioData, LIBRARY_SEED_ENTRIES };

  await seedIfChanged("plantfolio", fingerprintInput, () => runSeedPlantfolio(entries));
}

async function runSeedPlantfolio(entries: PlantfolioRawEntry[]): Promise<string> {
  // `commonExamples` est un texte libre : l'extraction du nom scientifique
  // (voir `extractScientificName`) produit parfois le meme nom pour deux
  // fiches distinctes -- une fiche LOCAL et son equivalent plantfolio (ex.
  // "Aloe vera" des deux cotes), ou deux fiches plantfolio entre elles (une
  // entree "genre" generique comme "Aloes" qui cite "Aloe vera" en exemple,
  // a cote d'une fiche specifique "Aloe Vera"). Dans les deux cas, un meme
  // `scientificName` sur deux lignes ferait apparaitre un faux doublon dans
  // la recherche. Regle : une fiche LOCAL (soignee a la main) a toujours
  // priorite -- son equivalent plantfolio n'est pas importe. Entre deux
  // fiches plantfolio, la premiere a "reclamer" un nom scientifique le
  // garde ; les suivantes gardent tout leur contenu mais sans ce champ.
  const localScientificNames = new Set(
    (await db.plantLibraryEntry.findMany({ where: { source: "LOCAL" }, select: { scientificName: true } }))
      .map((e) => e.scientificName)
      .filter((n): n is string => Boolean(n)),
  );
  const claimedByPlantfolio = new Set<string>();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const raw of entries) {
    const mapped = mapPlantfolioEntry(raw);

    if (mapped.scientificName && localScientificNames.has(mapped.scientificName)) {
      // Si une fiche locale a ete ajoutee apres coup pour cette espece
      // (redeploiement ulterieur), on nettoie l'entree plantfolio devenue
      // redondante plutot que de la laisser trainer en double.
      await db.plantLibraryEntry.deleteMany({ where: { source: "PLANTFOLIO", sourceId: raw.id } });
      skipped += 1;
      continue;
    }

    let scientificName = mapped.scientificName;
    if (scientificName) {
      if (claimedByPlantfolio.has(scientificName)) {
        scientificName = null;
      } else {
        claimedByPlantfolio.add(scientificName);
      }
    }

    if (!scientificName) {
      // Ni espece ni genre exploitable (categorie generique type "Air
      // Plants"/"Bonsai", hybride intergenerique, ou nom deja reclame par
      // une autre fiche plantfolio) : sans nom, la fiche n'est ni
      // cherchable par espece ni rattachable a une photo -- on ne l'importe
      // pas (et on nettoie si elle existait d'un import precedent).
      await db.plantLibraryEntry.deleteMany({ where: { source: "PLANTFOLIO", sourceId: raw.id } });
      skipped += 1;
      continue;
    }

    const existing = await db.plantLibraryEntry.findUnique({
      where: { source_sourceId: { source: "PLANTFOLIO", sourceId: raw.id } },
    });

    // Une fiche corrigee/completee a la main (photo et/ou nom scientifique
    // choisis manuellement, ex. quand plantfolio a un nom d'espece imprecis)
    // ne doit plus jamais etre touchee par le reimport automatique.
    if (existing?.imageSource === "MANUAL") {
      updated += 1;
      continue;
    }

    // plantfolio ne fournit aucune image : une photo presente sur la fiche
    // existante vient forcement d'un rattrapage externe (backfillImages.ts,
    // OpenPlantbook/iNaturalist) -- ne jamais l'ecraser en reimportant.
    const existingImageUrl = (existing?.careProfile as { imageUrl?: string } | null)?.imageUrl;
    const careProfile = existingImageUrl ? { ...mapped.careProfile, imageUrl: existingImageUrl } : mapped.careProfile;

    const data = {
      commonName: mapped.commonName,
      scientificName,
      family: mapped.family,
      careProfile: careProfile as unknown as Prisma.InputJsonValue,
      source: "PLANTFOLIO",
      sourceId: raw.id,
      lastSyncedAt: new Date(),
    };
    if (existing) {
      await db.plantLibraryEntry.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await db.plantLibraryEntry.create({ data: { ...data, importedAt: new Date() } });
      created += 1;
    }
  }
  return `Bibliothèque (plantfolio) : ${created} créée(s), ${updated} mise(s) à jour, ${skipped} ignorée(s) (déjà couvertes par une fiche locale) sur ${entries.length} au total.`;
}

async function main() {
  await seedLibrary();
  await seedPlantfolio();

  const email = (process.env.SEED_USER_EMAIL ?? "demo@example.com").trim().toLowerCase();
  // Aucun mot de passe par defaut : un SEED_USER_PASSWORD oublie donnait
  // auparavant un compte administrateur avec "changeme123" en clair.
  if (!process.env.SEED_USER_PASSWORD) {
    throw new Error("SEED_USER_PASSWORD est requis (aucune valeur par defaut).");
  }
  const password = process.env.SEED_USER_PASSWORD;

  const passwordHash = await bcrypt.hash(password, 10);

  // isAdmin ET passwordHash sur update (pas seulement create) : garantit
  // que le compte designe par SEED_USER_EMAIL reste administrateur a
  // chaque redeploiement, et que changer SEED_USER_PASSWORD puis relancer
  // le seed change reellement le mot de passe d'un compte deja existant
  // (auparavant seul isAdmin etait mis a jour, le README promettait
  // pourtant que ce mecanisme fonctionnait).
  const user = await db.user.upsert({
    where: { email },
    update: { isAdmin: true, passwordHash },
    create: { email, passwordHash, name: "Demo", isAdmin: true },
  });

  const existingPlantCount = await db.plant.count({ where: { userId: user.id } });
  if (existingPlantCount > 0) {
    console.log(`Utilisateur ${email} déjà initialisé (${existingPlantCount} plantes) - seed ignoré.`);
    return;
  }

  const [salon, chambre, cuisine] = await Promise.all([
    db.location.upsert({ where: { userId_name: { userId: user.id, name: "Salon" } }, update: {}, create: { userId: user.id, name: "Salon" } }),
    db.location.upsert({ where: { userId_name: { userId: user.id, name: "Chambre" } }, update: {}, create: { userId: user.id, name: "Chambre" } }),
    db.location.upsert({ where: { userId_name: { userId: user.id, name: "Cuisine" } }, update: {}, create: { userId: user.id, name: "Cuisine" } }),
  ]);

  const fertilizer = await db.fertilizer.create({
    data: {
      userId: user.id,
      name: "Engrais plantes vertes",
      manufacturer: "Maison Verte",
      type: "liquide",
      nitrogen: 3,
      phosphorus: 1,
      potassium: 2,
      defaultDosage: 2,
      dosageUnit: "ml",
      notes: "Diluer dans l'eau d'arrosage, une fois par mois en période de croissance.",
    },
  });

  interface PlantSeed {
    name: string;
    scientificName: string;
    locationId: string;
    potDiameterMm: number;
    substrate: string;
    exposure: string;
    watering: { intervalDays: number; lastPerformedDaysAgo: number; amountMl: number };
    fertilizing?: { intervalMonths: number; lastPerformedDaysAgo: number; seasonal?: boolean };
    repotting?: { intervalMonths: number; lastPerformedDaysAgo: number };
  }

  const plants: PlantSeed[] = [
    {
      name: "Monstera deliciosa",
      scientificName: "Monstera deliciosa",
      locationId: salon.id,
      potDiameterMm: 220,
      substrate: "Terreau plantes vertes + perlite",
      exposure: "Lumière indirecte vive",
      watering: { intervalDays: 7, lastPerformedDaysAgo: 8, amountMl: 1500 },
      fertilizing: { intervalMonths: 1, lastPerformedDaysAgo: 20, seasonal: true },
    },
    {
      name: "Calathea orbifolia",
      scientificName: "Calathea orbifolia",
      locationId: salon.id,
      potDiameterMm: 170,
      substrate: "Terreau plantes vertes + fibre de coco",
      exposure: "Mi-ombre",
      watering: { intervalDays: 5, lastPerformedDaysAgo: 2, amountMl: 800 },
      fertilizing: { intervalMonths: 1, lastPerformedDaysAgo: 30, seasonal: true },
    },
    {
      name: "Ficus elastica",
      scientificName: "Ficus elastica",
      locationId: salon.id,
      potDiameterMm: 250,
      substrate: "Terreau plantes vertes",
      exposure: "Lumière indirecte",
      watering: { intervalDays: 10, lastPerformedDaysAgo: 0, amountMl: 1000 },
    },
    {
      name: "Sansevieria trifasciata",
      scientificName: "Sansevieria trifasciata",
      locationId: chambre.id,
      potDiameterMm: 150,
      substrate: "Terreau pour cactus et plantes grasses",
      exposure: "Faible à forte luminosité",
      watering: { intervalDays: 21, lastPerformedDaysAgo: 20, amountMl: 300 },
    },
    {
      name: "Echeveria",
      scientificName: "Echeveria elegans",
      locationId: cuisine.id,
      potDiameterMm: 120,
      substrate: "Substrat drainant pour succulentes",
      exposure: "Plein soleil",
      watering: { intervalDays: 14, lastPerformedDaysAgo: 9, amountMl: 100 },
    },
    {
      name: "Pothos",
      scientificName: "Epipremnum aureum",
      locationId: chambre.id,
      potDiameterMm: 160,
      substrate: "Terreau plantes vertes",
      exposure: "Lumière indirecte, tolère l'ombre",
      watering: { intervalDays: 7, lastPerformedDaysAgo: 5, amountMl: 500 },
      repotting: { intervalMonths: 12, lastPerformedDaysAgo: 365 },
    },
  ];

  for (const spec of plants) {
    const plant = await db.plant.create({
      data: {
        userId: user.id,
        name: spec.name,
        scientificName: spec.scientificName,
        locationId: spec.locationId,
        potDiameterMm: spec.potDiameterMm,
        substrate: spec.substrate,
        exposure: spec.exposure,
        acquiredAt: daysFromNow(-180),
      },
    });

    // --- Règle d'arrosage + historique + tâche courante ---
    const wateringDueAt = daysFromNow(spec.watering.intervalDays - spec.watering.lastPerformedDaysAgo);
    const wateringRule = await db.plantCareRule.create({
      data: {
        plantId: plant.id,
        type: "WATERING",
        enabled: true,
        recurrenceType: "FIXED_INTERVAL_DAYS",
        interval: spec.watering.intervalDays,
        nextDueAt: wateringDueAt,
        configuration: { waterAmount: spec.watering.amountMl, waterUnit: "ml" },
      },
    });
    for (const offset of [2, 1]) {
      await db.careEvent.create({
        data: {
          plantId: plant.id,
          type: "WATERING",
          performedAt: daysFromNow(-spec.watering.lastPerformedDaysAgo - offset * spec.watering.intervalDays),
          quantity: spec.watering.amountMl,
          unit: "ml",
        },
      });
    }
    await db.careEvent.create({
      data: {
        plantId: plant.id,
        type: "WATERING",
        performedAt: daysFromNow(-spec.watering.lastPerformedDaysAgo),
        quantity: spec.watering.amountMl,
        unit: "ml",
      },
    });
    await db.task.create({
      data: {
        plantId: plant.id,
        careRuleId: wateringRule.id,
        type: "WATERING",
        title: buildTaskTitle("WATERING"),
        dueAt: wateringDueAt,
        status: "PENDING",
      },
    });

    // --- Règle de fertilisation (optionnelle) ---
    if (spec.fertilizing) {
      const fertilizingDueAt = daysFromNow(spec.fertilizing.intervalMonths * 30 - spec.fertilizing.lastPerformedDaysAgo);
      const fertilizingRule = await db.plantCareRule.create({
        data: {
          plantId: plant.id,
          type: "FERTILIZING",
          enabled: true,
          recurrenceType: "INTERVAL_MONTHS",
          interval: spec.fertilizing.intervalMonths,
          nextDueAt: fertilizingDueAt,
          configuration: {
            fertilizerId: fertilizer.id,
            dosagePerLiter: fertilizer.defaultDosage,
            dosageUnit: fertilizer.dosageUnit,
            ...(spec.fertilizing.seasonal ? { activeFromMonth: 3, activeUntilMonth: 9 } : {}),
          },
        },
      });
      await db.careEvent.create({
        data: {
          plantId: plant.id,
          type: "FERTILIZING",
          performedAt: daysFromNow(-spec.fertilizing.lastPerformedDaysAgo),
          quantity: fertilizer.defaultDosage,
          unit: fertilizer.dosageUnit,
          metadata: { fertilizerId: fertilizer.id },
        },
      });
      await db.task.create({
        data: {
          plantId: plant.id,
          careRuleId: fertilizingRule.id,
          type: "FERTILIZING",
          title: buildTaskTitle("FERTILIZING"),
          dueAt: fertilizingDueAt,
          status: "PENDING",
        },
      });
    }

    // --- Règle de rempotage (optionnelle) ---
    if (spec.repotting) {
      const repottingDueAt = daysFromNow(spec.repotting.intervalMonths * 30 - spec.repotting.lastPerformedDaysAgo);
      const repottingRule = await db.plantCareRule.create({
        data: {
          plantId: plant.id,
          type: "REPOTTING",
          enabled: true,
          recurrenceType: "INTERVAL_MONTHS",
          interval: spec.repotting.intervalMonths,
          nextDueAt: repottingDueAt,
        },
      });
      await db.careEvent.create({
        data: {
          plantId: plant.id,
          type: "REPOTTING",
          performedAt: daysFromNow(-spec.repotting.lastPerformedDaysAgo),
          metadata: { oldPotDiameterMm: spec.potDiameterMm - 40, newPotDiameterMm: spec.potDiameterMm },
        },
      });
      await db.task.create({
        data: {
          plantId: plant.id,
          careRuleId: repottingRule.id,
          type: "REPOTTING",
          title: buildTaskTitle("REPOTTING"),
          dueAt: repottingDueAt,
          status: "PENDING",
        },
      });
    }
  }

  await db.note.create({
    data: {
      plantId: (await db.plant.findFirstOrThrow({ where: { userId: user.id, name: "Monstera deliciosa" } })).id,
      content: "Nouvelle feuille fenêtrée observée cette semaine.",
      category: "CROISSANCE",
    },
  });

  console.log(`Seed terminé pour ${email} (${plants.length} plantes).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
