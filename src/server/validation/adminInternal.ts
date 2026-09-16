import { z } from "zod";

export const resendBetaEmailSchema = z.object({
  template: z.enum(["confirmation", "welcome", "waitlisted"]),
});

export const sendBetaInviteSchema = z.object({
  playConsoleUrl: z.string().trim().url("URL invalide.").max(500),
});
