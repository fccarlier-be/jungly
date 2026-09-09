import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { dueTasksWhere } from "@/server/careEngine/dueTasks";

export async function GET() {
  try {
    const userId = await requireUserId();
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const tasks = await db.task.findMany({
      where: { plant: { userId }, ...dueTasksWhere(endOfToday) },
      include: { plant: true, careRule: true },
      orderBy: { dueAt: "asc" },
    });

    const counts = {
      WATERING: 0,
      FERTILIZING: 0,
      REPOTTING: 0,
      PRUNING: 0,
      INSPECTION: 0,
      OTHER: 0,
    };
    for (const task of tasks) {
      counts[task.type] += 1;
    }

    const overdueCount = tasks.filter((t) => t.dueAt < startOfToday).length;

    return NextResponse.json({ tasks, counts, overdueCount, total: tasks.length });
  } catch (error) {
    return handleApiError(error);
  }
}
