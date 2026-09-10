import { z } from "zod";

// Un compte compromis pouvait sinon faire travailler SQLite tres longtemps
// (voire depasser le timeout de la transaction d'import) avec un payload
// artificiellement enorme -- ces bornes restent tres au-dessus de tout
// usage reel homelab.
const MAX_PLANTS = 1000;
const MAX_LOCATIONS = 200;
const MAX_FERTILIZERS = 200;
const MAX_CARE_RULES_PER_PLANT = 50;
const MAX_CARE_EVENTS_PER_PLANT = 10000;
const MAX_NOTES_PER_PLANT = 500;
const MAX_PHOTOS_PER_PLANT = 100;
const MAX_SENSORS_PER_PLANT = 20;
const MAX_READINGS_PER_SENSOR = 1000;
const MAX_SHORT_STRING = 200;
const MAX_LONG_STRING = 5000;
const MAX_URL_STRING = 500;
const MAX_JSON_SERIALIZED_SIZE = 10_000;

// Chaque capteur importe recoit une cle API fraiche (bcrypt, cout 10) --
// MAX_SENSORS_PER_PLANT (20) x MAX_PLANTS (1000) autoriserait jusqu'a
// 20 000 hachages bcrypt dans une seule transaction d'import sans ce
// plafond global, bien au-dela de tout usage homelab reel.
const MAX_SENSORS_TOTAL = 100;

// Le zip lui-meme est deja plafonne a 10 Mo compresses par nginx
// (client_max_body_size), mais JSZip decompresse entierement en memoire
// (voir sa doc "limitations") -- sans plafond explicite sur la taille
// decompressee, un zip malveillant pourrait faire exploser la memoire du
// serveur avant meme la validation Zod du JSON qu'il contient.
export const MAX_ZIP_ENTRIES = 2000;
export const MAX_UPLOAD_FILE_SIZE = 8 * 1024 * 1024;
export const MAX_TOTAL_DECOMPRESSED_SIZE = 50 * 1024 * 1024;

/** Limite la taille serialisee d'un objet libre (configuration/metadata) plutot qu'un schema recursif strict. */
const boundedJsonRecord = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .refine((value) => !value || JSON.stringify(value).length <= MAX_JSON_SERIALIZED_SIZE, {
    message: `Objet trop volumineux (max ${MAX_JSON_SERIALIZED_SIZE} caracteres serialises).`,
  });

const careEventBackupSchema = z.object({
  type: z.enum(["WATERING", "FERTILIZING", "REPOTTING", "PRUNING", "INSPECTION", "OTHER"]),
  performedAt: z.coerce.date(),
  quantity: z.number().nullable().optional(),
  unit: z.string().max(MAX_SHORT_STRING).nullable().optional(),
  metadata: boundedJsonRecord,
  note: z.string().max(MAX_LONG_STRING).nullable().optional(),
});

const careRuleBackupSchema = z.object({
  type: z.enum(["WATERING", "FERTILIZING", "REPOTTING"]),
  enabled: z.boolean(),
  recurrenceType: z.enum([
    "FIXED_INTERVAL_DAYS",
    "INTERVAL_WEEKS",
    "INTERVAL_MONTHS",
    "EXACT_DATE",
    "YEARLY",
    "MANUAL",
    "MOISTURE_THRESHOLD",
  ]),
  interval: z.number().nullable().optional(),
  configuration: boundedJsonRecord,
  // Resolu par nom plutot que par id : un import ne doit jamais dependre
  // des ids internes de l'installation d'origine.
  fertilizerName: z.string().max(MAX_SHORT_STRING).nullable().optional(),
});

const noteBackupSchema = z.object({
  content: z.string().max(MAX_LONG_STRING),
  category: z.enum(["OBSERVATION", "MALADIE", "PARASITE", "CROISSANCE", "FLORAISON", "AUTRE"]),
  photoUrl: z.string().max(MAX_URL_STRING).nullable().optional(),
});

const sensorReadingBackupSchema = z.object({
  value: z.number(),
  unit: z.string().max(MAX_SHORT_STRING),
  recordedAt: z.coerce.date(),
});

const sensorBackupSchema = z.object({
  type: z.enum(["SOIL_MOISTURE", "TEMPERATURE", "HUMIDITY", "LIGHT", "CONDUCTIVITY"]),
  name: z.string().max(MAX_SHORT_STRING),
  externalId: z.string().max(MAX_SHORT_STRING).nullable().optional(),
  // Pas de cle API exportee : un capteur importe recoit une cle fraiche
  // (POST /api/plants/:id/sensors la genere), l'ancienne devrait de toute
  // facon etre reconfiguree sur l'appareil physique lors d'un changement
  // de serveur.
  readings: z.array(sensorReadingBackupSchema).max(MAX_READINGS_PER_SENSOR).default([]),
});

const plantBackupSchema = z.object({
  name: z.string().max(MAX_SHORT_STRING),
  scientificName: z.string().max(MAX_SHORT_STRING).nullable().optional(),
  photoUrl: z.string().max(MAX_URL_STRING).nullable().optional(),
  locationName: z.string().max(MAX_SHORT_STRING).nullable().optional(),
  acquiredAt: z.coerce.date().nullable().optional(),
  potDiameterMm: z.number().nullable().optional(),
  potHeightMm: z.number().nullable().optional(),
  potMaterial: z.string().max(MAX_SHORT_STRING).nullable().optional(),
  substrate: z.string().max(MAX_SHORT_STRING).nullable().optional(),
  exposure: z.string().max(MAX_SHORT_STRING).nullable().optional(),
  temperatureNote: z.string().max(MAX_LONG_STRING).nullable().optional(),
  humidityNote: z.string().max(MAX_LONG_STRING).nullable().optional(),
  notes: z.string().max(MAX_LONG_STRING).nullable().optional(),
  careRules: z.array(careRuleBackupSchema).max(MAX_CARE_RULES_PER_PLANT).default([]),
  careEvents: z.array(careEventBackupSchema).max(MAX_CARE_EVENTS_PER_PLANT).default([]),
  plantNotes: z.array(noteBackupSchema).max(MAX_NOTES_PER_PLANT).default([]),
  photos: z.array(z.string().max(MAX_URL_STRING)).max(MAX_PHOTOS_PER_PLANT).default([]),
  sensors: z.array(sensorBackupSchema).max(MAX_SENSORS_PER_PLANT).default([]),
});

const fertilizerBackupSchema = z.object({
  name: z.string().max(MAX_SHORT_STRING),
  manufacturer: z.string().max(MAX_SHORT_STRING).nullable().optional(),
  type: z.string().max(MAX_SHORT_STRING).nullable().optional(),
  nitrogen: z.number().nullable().optional(),
  phosphorus: z.number().nullable().optional(),
  potassium: z.number().nullable().optional(),
  defaultDosage: z.number().nullable().optional(),
  dosageUnit: z.string().max(MAX_SHORT_STRING).nullable().optional(),
  notes: z.string().max(MAX_LONG_STRING).nullable().optional(),
});

export const backupSchema = z
  .object({
    version: z.literal(1),
    exportedAt: z.string().max(MAX_SHORT_STRING).optional(),
    locations: z.array(z.object({ name: z.string().max(MAX_SHORT_STRING) })).max(MAX_LOCATIONS).default([]),
    fertilizers: z.array(fertilizerBackupSchema).max(MAX_FERTILIZERS).default([]),
    plants: z.array(plantBackupSchema).max(MAX_PLANTS).default([]),
    weatherProfile: z
      .object({
        city: z.string().max(MAX_SHORT_STRING),
        latitude: z.number(),
        longitude: z.number(),
        wateringIntervalMultiplier: z.number().optional(),
      })
      .nullable()
      .optional(),
    notificationPreference: z
      .object({
        enabled: z.boolean(),
        notificationTime: z.string().max(MAX_SHORT_STRING),
        overdueEnabled: z.boolean(),
        advanceReminderDays: z.number(),
      })
      .nullable()
      .optional(),
  })
  .refine((data) => data.plants.reduce((sum, p) => sum + p.sensors.length, 0) <= MAX_SENSORS_TOTAL, {
    message: `Trop de capteurs au total (max ${MAX_SENSORS_TOTAL}).`,
    path: ["plants"],
  });

export type BackupData = z.infer<typeof backupSchema>;
