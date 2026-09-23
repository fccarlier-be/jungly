import { z } from "zod";

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
