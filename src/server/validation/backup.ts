import { z } from "zod";

const careEventBackupSchema = z.object({
  type: z.enum(["WATERING", "FERTILIZING", "REPOTTING", "PRUNING", "INSPECTION", "OTHER"]),
  performedAt: z.coerce.date(),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  metadata: z.unknown().nullable().optional(),
  note: z.string().nullable().optional(),
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
  configuration: z.record(z.string(), z.unknown()).nullable().optional(),
  // Resolu par nom plutot que par id : un import ne doit jamais dependre
  // des ids internes de l'installation d'origine.
  fertilizerName: z.string().nullable().optional(),
});

const noteBackupSchema = z.object({
  content: z.string(),
  category: z.enum(["OBSERVATION", "MALADIE", "PARASITE", "CROISSANCE", "FLORAISON", "AUTRE"]),
  photoUrl: z.string().nullable().optional(),
});

const plantBackupSchema = z.object({
  name: z.string(),
  scientificName: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  locationName: z.string().nullable().optional(),
  acquiredAt: z.coerce.date().nullable().optional(),
  potDiameterMm: z.number().nullable().optional(),
  potHeightMm: z.number().nullable().optional(),
  potMaterial: z.string().nullable().optional(),
  substrate: z.string().nullable().optional(),
  exposure: z.string().nullable().optional(),
  temperatureNote: z.string().nullable().optional(),
  humidityNote: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  careRules: z.array(careRuleBackupSchema).default([]),
  careEvents: z.array(careEventBackupSchema).default([]),
  plantNotes: z.array(noteBackupSchema).default([]),
});

const fertilizerBackupSchema = z.object({
  name: z.string(),
  manufacturer: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  nitrogen: z.number().nullable().optional(),
  phosphorus: z.number().nullable().optional(),
  potassium: z.number().nullable().optional(),
  defaultDosage: z.number().nullable().optional(),
  dosageUnit: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().optional(),
  locations: z.array(z.object({ name: z.string() })).default([]),
  fertilizers: z.array(fertilizerBackupSchema).default([]),
  plants: z.array(plantBackupSchema).default([]),
  notificationPreference: z
    .object({
      enabled: z.boolean(),
      notificationTime: z.string(),
      overdueEnabled: z.boolean(),
      advanceReminderDays: z.number(),
    })
    .nullable()
    .optional(),
});

export type BackupData = z.infer<typeof backupSchema>;
