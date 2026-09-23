import { z } from "zod";
import {
  CUTTING_LISTING_TYPES,
  CUTTING_RATING_MIN,
  CUTTING_RATING_MAX,
  CUTTING_REPORT_REASONS,
  MAX_CUTTING_PHOTOS,
  MAX_CUTTING_QUANTITY,
  mentionsPrice,
} from "@/server/cuttings/types";

export const createCuttingListingSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    species: z.string().trim().max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    type: z.enum(CUTTING_LISTING_TYPES),
    quantity: z.number().int().min(1).max(MAX_CUTTING_QUANTITY).default(1),
    // Au moins une photo exigee -- exigence produit, pas seulement une limite
    // technique (voir CuttingListing.photoUrls dans schema.prisma).
    photoUrls: z.array(z.string().trim().min(1).max(500)).min(1).max(MAX_CUTTING_PHOTOS),
    // Engagement explicite a ne pas vendre (voir CUTTINGS_NO_SALE_RULE) --
    // verifie cote serveur aussi, jamais seulement par la case du formulaire.
    noSaleAccepted: z.literal(true, { message: "Tu dois t'engager à donner ou échanger, jamais vendre." }),
  })
  .refine((v) => !mentionsPrice(`${v.title} ${v.description ?? ""}`), {
    message: "Les annonces ne peuvent pas mentionner de prix : les boutures se donnent ou s'échangent, jamais contre de l'argent.",
    path: ["description"],
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

export const recordCuttingTransactionSchema = z.object({
  recipientId: z.string().min(1),
  quantity: z.number().int().min(1).max(MAX_CUTTING_QUANTITY),
});

export const createCuttingReportSchema = z.object({
  reportedUserId: z.string().min(1),
  listingId: z.string().min(1),
  reason: z.enum(CUTTING_REPORT_REASONS),
  comment: z.string().trim().max(1000).optional(),
});

export type CreateCuttingReportInput = z.infer<typeof createCuttingReportSchema>;

export const createCuttingRatingSchema = z.object({
  score: z.number().int().min(CUTTING_RATING_MIN).max(CUTTING_RATING_MAX),
  comment: z.string().trim().max(1000).optional(),
});

export type CreateCuttingRatingInput = z.infer<typeof createCuttingRatingSchema>;

export const warnMessageSchema = z.object({
  message: z.string().trim().min(1, "Le message d'avertissement est obligatoire.").max(1000),
});
