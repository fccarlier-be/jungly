import { z } from "zod";

const recurrenceTypeSchema = z.enum([
  "FIXED_INTERVAL_DAYS",
  "INTERVAL_WEEKS",
  "INTERVAL_MONTHS",
  "EXACT_DATE",
  "YEARLY",
  "MANUAL",
  "MOISTURE_THRESHOLD",
]);

const seasonalConfigSchema = z.object({
  activeFromMonth: z.number().int().min(1).max(12).optional(),
  activeUntilMonth: z.number().int().min(1).max(12).optional(),
});

// .strict() : rejette toute cle non prevue (pas seulement stripped
// silencieusement, comportement par defaut de zod) -- important pour
// configSchemaByType plus bas, qui revalide un PATCH ou un client pourrait
// sinon glisser des champs arbitraires dans `configuration`.
const wateringConfigSchema = seasonalConfigSchema
  .extend({
    waterAmount: z.number().positive().optional(),
    waterUnit: z.enum(["ml", "L"]).optional(),
    moistureThresholdPercent: z.number().min(0).max(100).optional(),
  })
  .strict();

const fertilizingConfigSchema = seasonalConfigSchema
  .extend({
    fertilizerId: z.string().min(1).optional(),
    dosagePerLiter: z.number().positive().optional(),
    dosageUnit: z.enum(["ml", "g"]).optional(),
    dilutionVolumeLiters: z.number().positive().optional(),
  })
  .strict();

const repottingConfigSchema = seasonalConfigSchema
  .extend({
    exactDate: z.coerce.date().optional(),
  })
  .strict();

const baseCareRuleSchema = z.object({
  plantId: z.string().min(1),
  enabled: z.boolean().default(true),
  recurrenceType: recurrenceTypeSchema,
  interval: z.number().int().positive().optional(),
});

export const createWateringRuleSchema = baseCareRuleSchema.extend({
  type: z.literal("WATERING"),
  configuration: wateringConfigSchema.optional(),
});

export const createFertilizingRuleSchema = baseCareRuleSchema.extend({
  type: z.literal("FERTILIZING"),
  configuration: fertilizingConfigSchema.optional(),
});

export const createRepottingRuleSchema = baseCareRuleSchema.extend({
  type: z.literal("REPOTTING"),
  configuration: repottingConfigSchema.optional(),
});

/**
 * Schema de `configuration` par type de regle -- reutilise pour revalider
 * un PATCH apres fusion avec la regle existante (voir configSchemaByType
 * plus bas) : CREATE valide deja ces formes via le discriminated union,
 * mais updateCareRuleSchema accepte un `configuration` non type (chaque
 * champ etant independamment optionnel sur un PATCH), donc sans ce
 * re-controle une valeur incoherente (ex. dosagePerLiter negatif, cle
 * arbitraire) passait sans jamais etre verifiee contre la forme attendue.
 */
export const configSchemaByType = {
  WATERING: wateringConfigSchema,
  FERTILIZING: fertilizingConfigSchema,
  REPOTTING: repottingConfigSchema,
} as const;

const INTERVAL_RECURRENCE_TYPES = new Set(["FIXED_INTERVAL_DAYS", "INTERVAL_WEEKS", "INTERVAL_MONTHS"]);

/**
 * Sans ce controle, une regle FIXED_INTERVAL_DAYS/INTERVAL_WEEKS/
 * INTERVAL_MONTHS sans interval, ou EXACT_DATE sans configuration.exactDate,
 * passait la validation puis faisait planter computeNextDueDate() (Error
 * generique, 500) au moment de generer sa tache -- apres que la regle ait
 * deja ete enregistree en base (voir #11 dans le suivi).
 */
function checkRecurrenceCombo(
  data: {
    type: "WATERING" | "FERTILIZING" | "REPOTTING";
    recurrenceType: z.infer<typeof recurrenceTypeSchema>;
    interval?: number | null;
    configuration?: Record<string, unknown> | null;
  },
  ctx: z.RefinementCtx,
) {
  if (INTERVAL_RECURRENCE_TYPES.has(data.recurrenceType) && data.interval == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["interval"],
      message: `${data.recurrenceType} nécessite un intervalle (interval).`,
    });
  }
  if (data.recurrenceType === "EXACT_DATE") {
    if (data.type !== "REPOTTING") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recurrenceType"],
        message: "EXACT_DATE n'est pris en charge que pour le rempotage.",
      });
    } else if (!(data.configuration as { exactDate?: unknown } | undefined)?.exactDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["configuration", "exactDate"],
        message: "EXACT_DATE nécessite une date (configuration.exactDate).",
      });
    }
  }
  // Sans ce controle, une regle FERTILIZING/REPOTTING pouvait etre creee avec
  // MOISTURE_THRESHOLD : un capteur d'humidite du sol declencherait alors une
  // fertilisation/un rempotage quand le sol est sec, ce qui n'a pas de sens.
  if (data.recurrenceType === "MOISTURE_THRESHOLD" && data.type !== "WATERING") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recurrenceType"],
      message: "MOISTURE_THRESHOLD n'est pris en charge que pour l'arrosage.",
    });
  }
}

export const createCareRuleSchema = z
  .discriminatedUnion("type", [createWateringRuleSchema, createFertilizingRuleSchema, createRepottingRuleSchema])
  .superRefine(checkRecurrenceCombo);

export const updateCareRuleSchema = z.object({
  enabled: z.boolean().optional(),
  recurrenceType: recurrenceTypeSchema.optional(),
  interval: z.number().int().positive().optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Revalide la combinaison recurrenceType/interval/exactDate apres fusion
 * avec la regle existante lors d'un PATCH (updateCareRuleSchema seul ne
 * peut pas le faire : chaque champ est optionnel independamment).
 */
export const recurrenceComboCheckSchema = z
  .object({
    type: z.enum(["WATERING", "FERTILIZING", "REPOTTING"]),
    recurrenceType: recurrenceTypeSchema,
    interval: z.number().int().positive().nullable().optional(),
    configuration: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .superRefine(checkRecurrenceCombo);

export type CreateCareRuleInput = z.infer<typeof createCareRuleSchema>;
export type UpdateCareRuleInput = z.infer<typeof updateCareRuleSchema>;
