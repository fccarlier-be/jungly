import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { createPlantSchema } from "@/server/validation/plant";
import { getOwnedLocation } from "@/server/ownership";
import { effectiveDueDate } from "@/server/careEngine/dueTasks";
import { resolvePhotoUrl } from "@/server/uploads";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

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
        // PENDING seul ignorait les taches reportees (SNOOZED) : une plante
        // avec uniquement une tache snoozee semblait n'avoir "rien a faire"
        // (mauvais filtre "none", pas de prochaine tache affichee), alors
        // qu'elle a bien une tache active, juste repoussee.
        tasks: { where: { status: { in: ["PENDING", "SNOOZED"] } } },
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
      // Tri par date effective (snoozedUntil pour une tache reportee, sinon
      // dueAt) : sans ca, une tache PENDING lointaine pouvait passer devant
      // une tache SNOOZED dont le report est deja arrive a echeance.
      const sortedTasks = [...plant.tasks].sort(
        (a, b) => effectiveDueDate(a).getTime() - effectiveDueDate(b).getTime(),
      );
      const nextTask = sortedTasks[0] ?? null;
      const overdue = sortedTasks.some((t) => effectiveDueDate(t) < now);
      return { ...plant, tasks: sortedTasks, nextTask, overdue };
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
        return effectiveDueDate(a.nextTask).getTime() - effectiveDueDate(b.nextTask).getTime();
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

    // Meme si aucune ressource individuelle n'est "sensible" (contrairement
    // aux uploads/capteurs), un compte compromis ou un inscription publique
    // detournee pourrait sinon creer des milliers de plantes en boucle et
    // faire travailler SQLite pour rien.
    const { allowed, retryAfterSeconds } = checkRateLimit(`plant-create:${userId}`, 50, 60 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const body = await request.json();
    const input = createPlantSchema.parse(body);

    // locationId est un id fourni par le client : sans cette verification, un
    // utilisateur pourrait rattacher sa plante a l'emplacement d'un autre
    // compte (l'emplacement est ensuite renvoye avec la plante).
    if (input.locationId) {
      await getOwnedLocation(userId, input.locationId);
    }
    const photoUrl = await resolvePhotoUrl(userId, input.photoUrl);

    const plant = await db.plant.create({
      data: { ...input, photoUrl, userId },
    });

    return NextResponse.json(plant, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
