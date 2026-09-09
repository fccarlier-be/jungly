import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { createPlantSchema } from "@/server/validation/plant";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const filter = request.nextUrl.searchParams.get("filter");
    const sort = request.nextUrl.searchParams.get("sort") ?? "name";

    const plants = await db.plant.findMany({
      where: { userId },
      include: {
        location: true,
        careRules: true,
        tasks: { where: { status: "PENDING" }, orderBy: { dueAt: "asc" } },
      },
      orderBy:
        sort === "location"
          ? { location: { name: "asc" } }
          : sort === "createdAt"
            ? { createdAt: "desc" }
            : { name: "asc" },
    });

    const now = new Date();
    const withState = plants.map((plant) => {
      const nextTask = plant.tasks[0] ?? null;
      const overdue = plant.tasks.some((t) => t.dueAt < now);
      return { ...plant, nextTask, overdue };
    });

    const filtered = withState.filter((plant) => {
      switch (filter) {
        case "watering":
          return plant.tasks.some((t) => t.type === "WATERING");
        case "fertilizing":
          return plant.tasks.some((t) => t.type === "FERTILIZING");
        case "overdue":
          return plant.overdue;
        case "none":
          return plant.tasks.length === 0;
        default:
          return true;
      }
    });

    if (sort === "nextTask") {
      filtered.sort((a, b) => {
        if (!a.nextTask) return 1;
        if (!b.nextTask) return -1;
        return a.nextTask.dueAt.getTime() - b.nextTask.dueAt.getTime();
      });
    }

    return NextResponse.json(filtered);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const input = createPlantSchema.parse(body);

    const plant = await db.plant.create({
      data: { ...input, userId },
    });

    return NextResponse.json(plant, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
