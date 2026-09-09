import { z } from "zod";

export const createNoteSchema = z.object({
  plantId: z.string().trim().min(1),
  content: z.string().trim().min(1).max(2000),
  category: z
    .enum(["OBSERVATION", "MALADIE", "PARASITE", "CROISSANCE", "FLORAISON", "AUTRE"])
    .default("OBSERVATION"),
  photoUrl: z.string().trim().max(500).optional(),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
