import { z } from "zod";

// bcrypt ne prend en compte que les 72 premiers OCTETS du mot de passe (pas
// caracteres) -- au-dela, deux mots de passe partageant le meme prefixe de
// 72 octets deviendraient equivalents. .max() de zod compte les caracteres
// (unites UTF-16), pas les octets UTF-8 : un refine explicite sur la taille
// encodee est necessaire pour rester correct avec des caracteres multi-octets
// (accents, emoji).
const MAX_PASSWORD_BYTES = 72;

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse email invalide."),
  password: z
    .string()
    .min(8, "8 caractères minimum.")
    .refine((value) => Buffer.byteLength(value, "utf8") <= MAX_PASSWORD_BYTES, {
      message: `Mot de passe trop long (max ${MAX_PASSWORD_BYTES} octets).`,
    }),
  name: z.string().trim().min(1).max(60).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
