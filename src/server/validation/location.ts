import { z } from "zod";

export const createLocationSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(80),
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;
