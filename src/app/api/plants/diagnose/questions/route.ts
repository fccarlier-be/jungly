import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { SYMPTOM_CATEGORIES, type SymptomCategory } from "@/server/diagnosis/types";
import { getFollowUpQuestions } from "@/server/diagnosis/qcmTree";

function isSymptomCategory(value: unknown): value is SymptomCategory {
  return typeof value === "string" && (SYMPTOM_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Deuxieme etape du QCM adaptatif : questions de suivi propres a la
 * categorie choisie (voir qcmTree.ts). Route dediee plutot que d'exposer
 * tout l'arbre au client -- la logique reste server-side/versionnable sans
 * casser un client deja charge.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUserId();
    const categoryRaw = request.nextUrl.searchParams.get("category");
    if (!isSymptomCategory(categoryRaw)) {
      return NextResponse.json({ error: "Catégorie de symptôme invalide." }, { status: 400 });
    }
    return NextResponse.json({ questions: getFollowUpQuestions(categoryRaw) });
  } catch (error) {
    return handleApiError(error);
  }
}
