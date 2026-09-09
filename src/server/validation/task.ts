import { z } from "zod";

export const snoozeTaskSchema = z.object({
  until: z.coerce.date(),
});

export type SnoozeTaskInput = z.infer<typeof snoozeTaskSchema>;
