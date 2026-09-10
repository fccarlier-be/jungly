import { z } from "zod";

export const setWeatherProfileSchema = z.object({
  city: z.string().trim().min(1).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type SetWeatherProfileInput = z.infer<typeof setWeatherProfileSchema>;
