import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@generated/prisma/client";
import { UnauthorizedError, NotFoundError, ConflictError, ForbiddenError, BadRequestError } from "@/lib/errors";
import { PerenualError } from "@/server/perenual/client";

// Re-exportees pour compatibilite -- la definition vit desormais dans
// errors.ts (sans dependance next/server, importable depuis un module
// teste directement sous Vitest). Ne pas dupliquer les classes ici.
export { NotFoundError, ConflictError, ForbiddenError, BadRequestError };

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

  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof ConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof BadRequestError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Filet de securite : ne devrait plus se produire une fois les etats de
  // tache verifies explicitement (ConflictError ci-dessus), mais evite un
  // 500 opaque si un autre appel venait a violer une contrainte unique.
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json({ error: "Cette action a déjà été effectuée." }, { status: 409 });
  }

  if (error instanceof PerenualError) {
    return NextResponse.json({ error: error.message }, { status: error.status === 429 ? 429 : 502 });
  }

  console.error(error);
  return NextResponse.json({ error: "Une erreur inattendue est survenue." }, { status: 500 });
}
