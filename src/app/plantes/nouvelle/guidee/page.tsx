import Link from "next/link";
import { requireSessionUserId } from "@/lib/session";
import GuidedFirstPlantForm from "@/components/GuidedFirstPlantForm";

/**
 * Version guidee (2 ecrans courts) du formulaire d'ajout, proposee a la fin
 * de la presentation de premier lancement (OnboardingTour) pour la toute
 * premiere plante d'un compte. Le formulaire complet (locations, jardinieres,
 * engrais, pot detaille...) reste accessible via le lien ci-dessous, et sert
 * ensuite a completer la fiche.
 */
export default async function GuidedNewPlantPage() {
  await requireSessionUserId();

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">Ajouter ma première plante</h1>
      <GuidedFirstPlantForm />
      <p className="text-center">
        <Link href="/plantes/nouvelle" className="text-muted text-sm underline">
          Préférer le formulaire complet
        </Link>
      </p>
    </div>
  );
}
