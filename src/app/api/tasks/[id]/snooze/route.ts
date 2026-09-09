import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { getOwnedTask } from "@/server/ownership";
import { snoozeTaskSchema } from "@/server/validation/task";
import { snoozeTaskById } from "@/server/careEngine/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getOwnedTask(userId, id);

    const body = await request.json();
    const input = snoozeTaskSchema.parse(body);

    const task = await snoozeTaskById(id, input.until);
    return NextResponse.json(task);
  } catch (error) {
    return handleApiError(error);
  }
}
