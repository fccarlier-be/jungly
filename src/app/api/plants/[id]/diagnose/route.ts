import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import type { Prisma } from "@generated/prisma/client";
import { requireUserId } from "@/lib/session";
import { handleApiError, BadRequestError } from "@/lib/apiError";
import { getOwnedPlant } from "@/server/ownership";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { db } from "@/server/db";
import {
  SYMPTOM_CATEGORIES,
  SYMPTOM_CATEGORY_LABEL,
  type SymptomCategory,
  type QcmAnswers,
  type DiagnosisResult,
  type PlantnetDiseaseCandidate,
  type PlantIdentification,
} from "@/server/diagnosis/types";
import { getRequestedPhotos, shouldCallDiseaseId } from "@/server/diagnosis/photoGuidance";
import { computeHypotheses } from "@/server/diagnosis/ruleEngine";
import { buildLocalContext } from "@/server/diagnosis/localContext";
import { identifyPlant, identifyDiseases, type PlantnetOrgan } from "@/server/plantnet/client";
import { processAndStoreUpload } from "@/server/uploads";

// Meme pipeline que /api/plants/identify et /api/uploads (voir ces
// fichiers) : aucune raison de traiter les photos d'un diagnostic
// differemment d'un televersement normal.
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const MAX_INPUT_PIXELS = 40_000_000;

function isSymptomCategory(value: unknown): value is SymptomCategory {
  return typeof value === "string" && (SYMPTOM_CATEGORIES as readonly string[]).includes(value);
}

type Params = { params: Promise<{ id: string }> };

/**
 * Orchestration complete d'un diagnostic de sante par photo : contexte
 * local (etage 0, gratuit) + identification Pl@ntNet SEULEMENT si
 * necessaire + identification maladies Pl@ntNet SEULEMENT si le symptome
 * s'y prete (voir photoGuidance.shouldCallDiseaseId, economise le quota
 * partage) + moteur de regles local (ruleEngine.ts). Reste exploitable
 * meme si Pl@ntNet est injoignable/en quota depasse -- exigence produit
 * explicite -- en continuant sans identification/maladie confirmee plutot
 * que d'echouer tout le diagnostic pour un service tiers en panne.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id: plantId } = await params;
    const plant = await getOwnedPlant(userId, plantId);

    // Plus couteux qu'un evenement de soin classique (jusqu'a 2 appels
    // Pl@ntNet, plusieurs images traitees) -- quota plus serre que les 200/h
    // generiques de /api/plants/[id]/water.
    const { allowed, retryAfterSeconds } = checkRateLimit(`plant-diagnose:${userId}`, 5, 60 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const formData = await request.formData();
    const categoryRaw = formData.get("category");
    if (!isSymptomCategory(categoryRaw)) {
      return NextResponse.json({ error: "Catégorie de symptôme invalide." }, { status: 400 });
    }
    const category = categoryRaw;

    let answers: QcmAnswers = {};
    const answersRaw = formData.get("answers");
    if (typeof answersRaw === "string" && answersRaw.length > 0) {
      try {
        answers = JSON.parse(answersRaw) as QcmAnswers;
      } catch {
        return NextResponse.json({ error: "Réponses au questionnaire invalides." }, { status: 400 });
      }
    }

    const symptomVector = { category, answers };
    const photoRequests = getRequestedPhotos(symptomVector);

    // Chaque photo attendue est retraitee (sharp) et televersee comme un
    // upload normal (proprietaire = userId, meme mecanisme de nettoyage/GC
    // que n'importe quelle autre photo -- voir uploads.ts) ; le buffer deja
    // traite est garde en memoire pour l'envoyer directement a Pl@ntNet,
    // sans repasser par le disque une seconde fois.
    const images: Array<{ requestId: string; organ: PlantnetOrgan; buffer: Buffer; uploadedUrl: string }> = [];
    for (const photoReq of photoRequests) {
      const file = formData.get(`photo_${photoReq.id}`);
      if (!(file instanceof File)) {
        if (photoReq.required) {
          return NextResponse.json({ error: `Photo manquante : ${photoReq.label}.` }, { status: 400 });
        }
        continue;
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ error: "Format d'image non supporté." }, { status: 400 });
      }
      if (file.size > MAX_SIZE_BYTES) {
        return NextResponse.json({ error: "Image trop volumineuse (8 Mo max)." }, { status: 400 });
      }

      const inputBuffer = Buffer.from(await file.arrayBuffer());
      let processed: Buffer;
      try {
        processed = await sharp(inputBuffer, { limitInputPixels: MAX_INPUT_PIXELS })
          .rotate()
          .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
      } catch {
        throw new BadRequestError(`Image illisible ou dimensions excessives : ${photoReq.label}.`);
      }

      const uploadedUrl = await processAndStoreUpload(processed, userId);
      images.push({ requestId: photoReq.id, organ: photoReq.organ, buffer: processed, uploadedUrl });
    }

    if (images.length === 0) {
      return NextResponse.json({ error: "Aucune photo exploitable reçue." }, { status: 400 });
    }

    const localContext = await buildLocalContext(plantId);

    // Identification d'espece : seulement si la plante n'est pas deja
    // connue -- economise un appel Pl@ntNet pour la grande majorite des
    // diagnostics (une plante deja dans la collection a generalement deja
    // ete identifiee a la creation de sa fiche).
    let plantIdentification: PlantIdentification = {
      scientificName: plant.scientificName,
      commonName: plant.name,
      source: plant.scientificName ? "existing" : "unknown",
    };
    if (!plant.scientificName) {
      try {
        const primary = images.find((i) => i.requestId === "general") ?? images[0];
        const candidates = await identifyPlant([{ buffer: primary.buffer, filename: "diagnostic.jpg", organ: primary.organ }]);
        if (candidates.length > 0) {
          const [best] = candidates;
          plantIdentification = { scientificName: best.scientificName, commonName: best.commonNames[0] ?? best.scientificName, source: "plantnet" };
        }
      } catch (err) {
        // Pl@ntNet injoignable/quota depasse : le diagnostic continue sans
        // identification confirmee (exigence produit explicite).
        console.error("Identification Pl@ntNet indisponible pour ce diagnostic :", err);
      }
    }

    let plantnetDisease: PlantnetDiseaseCandidate[] | null = null;
    if (shouldCallDiseaseId(category)) {
      try {
        plantnetDisease = await identifyDiseases(images.map((i) => ({ buffer: i.buffer, filename: "diagnostic.jpg", organ: i.organ })));
      } catch (err) {
        console.error("Identification maladies Pl@ntNet indisponible pour ce diagnostic :", err);
        plantnetDisease = null;
      }
    }

    const hypotheses = computeHypotheses({ symptomVector, localContext, plantnetDisease });

    const observations: string[] = [`Symptôme signalé : ${SYMPTOM_CATEGORY_LABEL[category]}.`];
    if (plantnetDisease && plantnetDisease.length > 0) {
      observations.push(`Pl@ntNet évoque une possible correspondance visuelle avec : ${plantnetDisease.map((d) => d.name).join(", ")}.`);
    }

    await db.healthDiagnosis.create({
      data: {
        plantId,
        symptomCategory: category,
        symptomAnswers: answers as Prisma.InputJsonValue,
        photoUrls: images.map((i) => i.uploadedUrl) as Prisma.InputJsonValue,
        plantnetDiseaseResult: (plantnetDisease as Prisma.InputJsonValue | null) ?? undefined,
        hypotheses: hypotheses as unknown as Prisma.InputJsonValue,
        localContextSnapshot: localContext as unknown as Prisma.InputJsonValue,
      },
    });

    const result: DiagnosisResult = { plantIdentification, observations, plantnetDisease, hypotheses };
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
