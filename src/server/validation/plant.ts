import { z } from "zod";

export const createPlantSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(120),
  scientificName: z.string().trim().max(160).optional(),
  libraryEntryId: z.string().trim().min(1).optional(),
  photoUrl: z.string().trim().max(500).optional(),
  locationId: z.string().trim().min(1).optional(),
  acquiredAt: z.coerce.date().optional(),
  potDiameterMm: z.coerce.number().int().positive().optional(),
  potHeightMm: z.coerce.number().int().positive().optional(),
  potMaterial: z.string().trim().max(80).optional(),
  substrate: z.string().trim().max(200).optional(),
  exposure: z.string().trim().max(200).optional(),
  temperatureNote: z.string().trim().max(120).optional(),
  humidityNote: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const updatePlantSchema = createPlantSchema.partial();

export const addPlantPhotosSchema = z.object({
  urls: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
});

export type CreatePlantInput = z.infer<typeof createPlantSchema>;
export type UpdatePlantInput = z.infer<typeof updatePlantSchema>;
export type AddPlantPhotosInput = z.infer<typeof addPlantPhotosSchema>;
