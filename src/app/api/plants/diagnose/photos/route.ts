import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { SYMPTOM_CATEGORIES, type SymptomCategory, type QcmAnswers } from "@/server/diagnosis/types";
import { getRequestedPhotos } from "@/server/diagnosis/photoGuidance";

function isSymptomCategory(value: unknown): value is SymptomCategory {
  return typeof value === "string" && (SYMPTOM_CATEGORIES as readonly string[]).includes(value);
}

function isQcmAnswers(value: unknown): value is QcmAnswers {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string")));
}

/**
 * Troisieme etape du QCM adaptatif : quelles photos demander, deduites du
 * symptome complet (categorie + reponses) -- voir photoGuidance.ts. POST
 * (pas GET) puisque `answers` peut depasser la taille raisonnable d'une
 * query string une fois toutes les questions repondues.
 */
export async function POST(request: NextRequest) {
  try {
    await requireUserId();
    const body = await request.json().catch(() => null);
    const categoryRaw = body?.category;
    const answersRaw = body?.answers;

    if (!isSymptomCategory(categoryRaw)) {
      return NextResponse.json({ error: "Catégorie de symptôme invalide." }, { status: 400 });
    }
    if (answersRaw !== undefined && !isQcmAnswers(answersRaw)) {
      return NextResponse.json({ error: "Réponses au questionnaire invalides." }, { status: 400 });
    }

    const photos = getRequestedPhotos({ category: categoryRaw, answers: answersRaw ?? {} });
    return NextResponse.json({ photos });
  } catch (error) {
    return handleApiError(error);
  }
}
