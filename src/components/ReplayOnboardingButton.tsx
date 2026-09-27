"use client";

import { useState } from "react";
import OnboardingTour from "@/components/OnboardingTour";

/** Rejoue la presentation de premier lancement a la demande (Parametres). */
export default function ReplayOnboardingButton({ cuttingsEnabled, hasPlants }: { cuttingsEnabled: boolean; hasPlants: boolean }) {
  // La cle force un nouveau montage d'OnboardingTour a chaque clic : il gere
  // sa propre visibilite en interne et ne se rouvrirait pas sinon une fois
  // ferme une premiere fois.
  const [replayKey, setReplayKey] = useState(0);

  return (
    <>
      <button type="button" onClick={() => setReplayKey((k) => k + 1)} className="chip rounded-xl px-3 py-2 text-sm font-medium">
        Revoir la présentation
      </button>
      {replayKey > 0 && <OnboardingTour key={replayKey} firstName="" cuttingsEnabled={cuttingsEnabled} hasPlants={hasPlants} />}
    </>
  );
}
