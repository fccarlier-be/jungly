import { z } from "zod";

export const createFeedbackSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
