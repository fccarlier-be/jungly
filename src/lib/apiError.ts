import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { UnauthorizedError } from "@/lib/session";
import { PerenualError } from "@/server/perenual/client";

/**
 * Traduit une erreur en réponse HTTP compréhensible, sans jamais exposer de
 * stack trace au client. L'erreur brute est loggée côté serveur pour le
 * diagnostic.
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Vous devez être connecté." }, { status: 401 });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Données invalides.", details: error.flatten() },
      { status: 400 },
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return NextResponse.json({ error: "Cette ressource n'existe plus." }, { status: 404 });
  }

  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof PerenualError) {
    return NextResponse.json({ error: error.message }, { status: error.status === 429 ? 429 : 502 });
  }

  console.error(error);
  return NextResponse.json({ error: "Une erreur inattendue est survenue." }, { status: 500 });
}

export class NotFoundError extends Error {
  constructor(message = "Ressource introuvable.") {
    super(message);
  }
}
