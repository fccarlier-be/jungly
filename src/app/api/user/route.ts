import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { db } from "@/server/db";
import { updateUserSchema } from "@/server/validation/user";

export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const { name } = updateUserSchema.parse(await request.json());

    const user = await db.user.update({ where: { id: userId }, data: { name } });
    return NextResponse.json({ name: user.name });
  } catch (error) {
    return handleApiError(error);
  }
}
