import { z } from "zod";
import { CUTTING_LISTING_TYPES, CUTTING_RATING_MIN, CUTTING_RATING_MAX, MAX_CUTTING_PHOTOS } from "@/server/cuttings/types";

export const createCuttingListingSchema = z.object({
  title: z.string().trim().min(1).max(120),
  species: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  type: z.enum(CUTTING_LISTING_TYPES),
  // Au moins une photo exigee -- exigence produit, pas seulement une limite
  // technique (voir CuttingListing.photoUrls dans schema.prisma).
  photoUrls: z.array(z.string().trim().min(1).max(500)).min(1).max(MAX_CUTTING_PHOTOS),
});

export type CreateCuttingListingInput = z.infer<typeof createCuttingListingSchema>;

// 3 a 24 caracteres, lettres/chiffres d'abord, puis espaces . _ - autorises.
export const setPseudoSchema = z.object({
  pseudo: z
    .string()
    .trim()
    .min(3, "Le pseudo doit faire au moins 3 caractères.")
    .max(24, "Le pseudo ne peut pas dépasser 24 caractères.")
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u, "Lettres, chiffres, espaces, points, tirets et underscores uniquement."),
});

export const markThreadReadSchema = z.object({ withUserId: z.string().min(1) });

export const sendCuttingMessageSchema = z.object({
  recipientId: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
});

export type SendCuttingMessageInput = z.infer<typeof sendCuttingMessageSchema>;

export const completeCuttingListingSchema = z.object({
  completedWithUserId: z.string().min(1),
});

export const createCuttingRatingSchema = z.object({
  score: z.number().int().min(CUTTING_RATING_MIN).max(CUTTING_RATING_MAX),
  comment: z.string().trim().max(1000).optional(),
});

export type CreateCuttingRatingInput = z.infer<typeof createCuttingRatingSchema>;
