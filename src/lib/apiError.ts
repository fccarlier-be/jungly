import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@generated/prisma/client";
import { UnauthorizedError, NotFoundError, ConflictError, ForbiddenError, BadRequestError, ServiceUnavailableError, PlanLimitError } from "@/lib/errors";
import { PerenualError } from "@/server/perenual/client";
import { PlantnetError } from "@/server/plantnet/client";

// Re-exportees pour compatibilite -- la definition vit desormais dans
// errors.ts (sans dependance next/server, importable depuis un module
// teste directement sous Vitest). Ne pas dupliquer les classes ici.
export { NotFoundError, ConflictError, ForbiddenError, BadRequestError, ServiceUnavailableError, PlanLimitError };

/**
 * Traduit une erreur en réponse HTTP compréhensible, sans jamais exposer de
 * stack trace au client. L'erreur brute est loggée côté serveur pour le
 * diagnostic.
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Vous devez être connecté." }, { status: 401 });
  }

  if (error instanceof ServiceUnavailableError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  // 402 (Payment Required) : statut peu courant mais semantiquement exact,
  // et distinct de 403 (Forbidden) pour que le client puisse reconnaitre ce
  // cas precis sans inspecter le texte du message.
  if (error instanceof PlanLimitError) {
    return NextResponse.json({ error: error.message, code: "PLANT_LIMIT_REACHED", limit: error.limit }, { status: 402 });
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

  if (error instanceof PlantnetError) {
    return NextResponse.json({ error: error.message }, { status: error.status === 429 ? 429 : 502 });
  }

  console.error(error);
  return NextResponse.json({ error: "Une erreur inattendue est survenue." }, { status: 500 });
}
