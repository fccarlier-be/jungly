import { z } from "zod";

export const FEEDBACK_TOPICS = ["ACCUEIL", "TACHES", "PLANTES", "PARAMETRES", "BIBLIOTHEQUE", "ENGRAIS", "AUTRE"] as const;

export const createFeedbackSchema = z.object({
  summary: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(4000),
  topic: z.enum(FEEDBACK_TOPICS).default("AUTRE"),
  // Capture d'ecran deja televersee via /api/uploads -- voir resolvePhotoUrl
  // (verifie que CE compte l'a bien televersee, meme quand le retour
  // lui-meme est envoye anonymement).
  photoUrl: z.string().trim().max(500).optional(),
  anonymous: z.boolean().default(false),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
