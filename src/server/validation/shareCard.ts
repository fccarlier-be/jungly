import { z } from "zod";
import { SHARE_FORMATS } from "@/lib/shareCard";

const id = z.string().trim().min(1).max(64);

// Parametres de /api/plants/:id/share-card (query string).
export const shareCardQuerySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("single"),
    format: z.enum(SHARE_FORMATS),
    // Absent : photo de couverture de la plante (ou de sa fiche de bibliotheque).
    photo: id.optional(),
  }),
  z
    .object({
      mode: z.literal("beforeAfter"),
      format: z.enum(SHARE_FORMATS),
      before: id,
      after: id,
    })
    .refine((q) => q.before !== q.after, { message: "Choisis deux photos différentes.", path: ["after"] }),
]);

export type ShareCardQuery = z.infer<typeof shareCardQuerySchema>;
