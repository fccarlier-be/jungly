"use client";

import { useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import {
  TourWelcomeScene,
  TourTasksScene,
  TourLibraryScene,
  TourDiagnosisScene,
  TourToolsScene,
  TourCuttingsScene,
} from "@/components/art/paper";

interface Step {
  Scene: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}

function buildSteps(cuttingsEnabled: boolean): Step[] {
  const steps: Step[] = [
    {
      Scene: TourWelcomeScene,
      title: "Bienvenue dans Jungly",
      body: "On te montre l'essentiel en une minute. Tu peux passer à tout moment.",
    },
    {
      Scene: TourTasksScene,
      title: "L'accueil, au jour le jour",
      body: "Les soins du jour et ceux en retard, avec un geste pour valider ou reporter.",
    },
    {
      Scene: TourLibraryScene,
      title: "Mes plantes et la bibliothèque",
      body: "Ajoute une plante et retrouve-la dans plus de 780 fiches d'entretien, qui préremplissent l'arrosage et la lumière.",
    },
    {
      Scene: TourDiagnosisScene,
      title: "Diagnostic et santé",
      body: "Identifie une plante par photo, ou fais un point de santé quand quelque chose t'inquiète.",
    },
    {
      Scene: TourToolsScene,
      title: "Et pour aller plus loin",
      body: "Jardinières partagées, catalogue d'engrais, historique complet : tout est dans l'onglet Outils.",
    },
  ];
  if (cuttingsEnabled) {
    steps.push({
      Scene: TourCuttingsScene,
      title: "Et entre vous",
      body: "Dans Outils, donne ou échange des boutures avec d'autres membres.",
    });
  }
  return steps;
}

/**
 * Presentation de premier lancement (une fois dans la vie du compte, voir
 * server/onboarding.ts) -- rejouable a la demande via ReplayOnboardingButton
 * (Parametres). "Passer" comme "C'est parti" acquittent tous les deux : ne
 * jamais relancer la presentation d'elle-meme, meme abandonnee en route.
 */
export default function OnboardingTour({
  firstName,
  cuttingsEnabled,
  hasPlants,
}: {
  firstName: string;
  cuttingsEnabled: boolean;
  hasPlants: boolean;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const [index, setIndex] = useState(0);
  const steps = buildSteps(cuttingsEnabled);

  if (!visible) return null;

  const isLast = index === steps.length - 1;
  const step = steps[index];

  async function acknowledge() {
    try {
      await fetch("/api/onboarding/complete", { method: "POST" });
    } catch {
      // Best-effort : sans reseau, la presentation ne se rejouera pas cette
      // fois mais reapparaitrait au prochain chargement -- sans consequence.
    }
  }

  function skip() {
    setVisible(false);
    void acknowledge();
  }

  async function finish() {
    setVisible(false);
    await acknowledge();
    if (!hasPlants) {
      router.push("/plantes/nouvelle/guidee");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15, 42, 32, 0.55)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="card w-full max-w-sm space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden="true">
            {steps.map((_, i) => (
              <span
                key={i}
                className="h-1.5 w-5 rounded-full"
                style={{ background: i <= index ? "var(--primary)" : "var(--border)" }}
              />
            ))}
          </div>
          <button type="button" onClick={skip} className="text-muted text-sm font-medium">
            Passer
          </button>
        </div>

        <step.Scene className="mx-auto w-full max-w-[220px]" />

        <div className="space-y-1.5 text-center">
          <h2 id="onboarding-title" className="font-display text-lg font-semibold">
            {firstName ? step.title.replace("Bienvenue dans Jungly", `Bienvenue, ${firstName}`) : step.title}
          </h2>
          <p className="text-muted text-sm leading-relaxed">{step.body}</p>
        </div>

        <div className="flex gap-2 pt-1">
          {index > 0 && (
            <button type="button" onClick={() => setIndex((i) => i - 1)} className="chip rounded-xl px-4 py-2.5 text-sm font-medium">
              Précédent
            </button>
          )}
          <button
            type="button"
            onClick={() => (isLast ? void finish() : setIndex((i) => i + 1))}
            className="btn-primary flex-1 rounded-xl py-2.5 text-sm font-semibold"
          >
            {isLast ? (hasPlants ? "Terminé" : "Ajouter ma première plante") : "Suivant"}
          </button>
        </div>
      </div>
    </div>
  );
}
