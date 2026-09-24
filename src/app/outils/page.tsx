import Link from "next/link";
import { BookOpen, FlaskConical, Container, History, Leaf, type LucideIcon } from "@/components/icons";
import { isCuttingsMarketplaceEnabled } from "@/lib/features";

const TOOLS: Array<{ href: string; label: string; description: string; Icon: LucideIcon }> = [
  {
    href: "/bibliotheque",
    label: "Bibliothèque de plantes",
    description: "Fiches d'entretien par espèce, utilisées pour préremplir tes plantes.",
    Icon: BookOpen,
  },
  {
    href: "/engrais",
    label: "Mes engrais",
    description: "Les engrais que tu utilises, avec leur dosage.",
    Icon: FlaskConical,
  },
  {
    href: "/jardinieres",
    label: "Mes jardinières",
    description: "Contenants partagés par plusieurs plantes.",
    Icon: Container,
  },
  {
    href: "/historique",
    label: "Historique complet",
    description: "Tous les soins effectués, toutes plantes confondues.",
    Icon: History,
  },
];

export default function OutilsPage() {
  // Reservee a l'instance hebergee (voir features.ts) : n'a de sens
  // qu'entre comptes qui peuvent se rencontrer physiquement.
  const tools = isCuttingsMarketplaceEnabled()
    ? [
        ...TOOLS,
        {
          href: "/boutures",
          label: "Boutures",
          description: "Donner ou échanger des boutures avec d'autres membres.",
          Icon: Leaf,
        },
      ]
    : TOOLS;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold">Outils</h1>

      <div className="space-y-2.5">
        {tools.map(({ href, label, description, Icon }) => (
          <Link key={href} href={href} className="card flex items-center gap-3.5 p-4">
            <span
              className="icon-disc flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            >
              <Icon size={22} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{label}</span>
              <span className="text-muted block text-xs">{description}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
