import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedContainer } from "@/server/ownership";
import { updateContainerSchema } from "@/server/validation/container";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedContainer(userId, id);

    const body = await request.json();
    const input = updateContainerSchema.parse(body);

    const container = await db.container.update({ where: { id }, data: input });
    return NextResponse.json(container);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedContainer(userId, id);

    // onDelete: SetNull (schema.prisma) derattache automatiquement les
    // plantes concernees -- meme comportement que la suppression d'un
    // emplacement (Location), rien a faire de plus ici.
    await db.container.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
