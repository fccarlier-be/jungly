import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiError";
import { resetPasswordSchema } from "@/server/validation/passwordReset";
import { resetPassword } from "@/server/passwordReset";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  try {
    // Defense en profondeur contre le brute-force du token (deja un secret
    // aleatoire de 24 octets, mais gratuit a ajouter -- meme motif que la
    // limite sur /api/login).
    const { allowed, retryAfterSeconds } = checkRateLimit(`reset-password:${getClientIp(request)}`, 10, 15 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const body = await request.json();
    const { token, password } = resetPasswordSchema.parse(body);

    await resetPassword(token, password);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
