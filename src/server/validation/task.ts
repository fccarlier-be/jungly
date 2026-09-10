import { z } from "zod";

export const snoozeTaskSchema = z.object({
  until: z.coerce.date().refine((date) => date.getTime() > Date.now(), {
    message: "La date de report doit être dans le futur.",
  }),
});

export type SnoozeTaskInput = z.infer<typeof snoozeTaskSchema>;
