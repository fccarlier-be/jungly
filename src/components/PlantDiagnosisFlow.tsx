"use client";

import { useState } from "react";
import PlantDiagnosisWizard from "@/components/PlantDiagnosisWizard";
import DiagnosisResultView from "@/components/DiagnosisResult";
import type { DiagnosisResult } from "@/server/diagnosis/types";

/**
 * Petit wrapper client pour la page de diagnostic : la page elle-meme est
 * un composant serveur (verification session + ownership, voir
 * app/plantes/[id]/diagnostic/page.tsx) qui ne peut pas porter d'etat --
 * c'est ce composant qui detient le resultat final et bascule de
 * l'assistant (questions/photos) vers son affichage une fois recu.
 */
export default function PlantDiagnosisFlow({ plantId }: { plantId: string }) {
  const [result, setResult] = useState<DiagnosisResult | null>(null);

  if (result) return <DiagnosisResultView result={result} />;

  return <PlantDiagnosisWizard plantId={plantId} onResult={setResult} />;
}
