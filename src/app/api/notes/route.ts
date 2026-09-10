import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedPlant } from "@/server/ownership";
import { createNoteSchema } from "@/server/validation/note";
import { assertOwnedUpload } from "@/server/uploads";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const input = createNoteSchema.parse(body);

    await getOwnedPlant(userId, input.plantId);
    await assertOwnedUpload(userId, input.photoUrl);

    const note = await db.note.create({ data: input });
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
