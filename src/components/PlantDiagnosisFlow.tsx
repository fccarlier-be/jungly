"use client";

import { useState } from "react";
import { TriangleAlert } from "@/components/icons";
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

  return (
    <div className="space-y-4">
      <div className="card flex gap-2.5 p-3.5" style={{ borderLeft: "3px solid var(--warning)" }}>
        <TriangleAlert size={18} className="mt-0.5 shrink-0" style={{ color: "var(--warning)" }} aria-hidden />
        <p className="text-sm">
          Outil <strong>expérimental</strong> : il croise tes réponses avec l&apos;historique de la plante pour proposer
          des pistes de réflexion, mais ne peut <strong>en aucun cas garantir</strong> que ses résultats seront
          concluants. En cas de doute ou d&apos;urgence pour ta plante, fie-toi d&apos;abord à ton observation directe.
        </p>
      </div>
      <PlantDiagnosisWizard plantId={plantId} onResult={setResult} />
    </div>
  );
}
