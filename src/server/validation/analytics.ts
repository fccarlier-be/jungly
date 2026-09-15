import { z } from "zod";

export const pageViewSchema = z.object({
  path: z.string().trim().min(1).max(200),
  referrer: z.string().trim().max(500).optional(),
});
