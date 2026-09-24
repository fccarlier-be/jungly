import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "@/components/icons";

type Status = "confirmed" | "waitlisted" | "already-confirmed" | "already-waitlisted" | "invalid";

const CONTENT: Record<Status, { icon: typeof CheckCircle2; title: string; body: string }> = {
  confirmed: {
    icon: CheckCircle2,
    title: "Inscription confirmée !",
    body: "Votre place dans la bêta Android est réservée. Vous recevrez un email avec le lien d'invitation dès que la bêta ouvrira.",
  },
  "already-confirmed": {
    icon: CheckCircle2,
    title: "Déjà confirmé",
    body: "Cette inscription est déjà confirmée — votre place dans la bêta Android est réservée.",
  },
  waitlisted: {
    icon: Clock,
    title: "Vous êtes sur liste d'attente",
    body: "Les places disponibles ont été prises entre votre inscription et votre confirmation. Vous serez contacté·e par email en priorité si une place se libère.",
  },
  "already-waitlisted": {
    icon: Clock,
    title: "Sur liste d'attente",
    body: "Cette inscription est déjà sur liste d'attente. Vous serez contacté·e par email en priorité si une place se libère.",
  },
  invalid: {
    icon: XCircle,
    title: "Lien invalide ou expiré",
    body: "Ce lien de confirmation n'est pas reconnu. Si vous venez de vous inscrire, vérifiez que vous avez cliqué sur le lien du dernier email reçu.",
  },
};

export default async function BetaConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const content = CONTENT[status as Status] ?? CONTENT.invalid;
  const Icon = content.icon;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center" style={{ background: "var(--bg)" }}>
      <div
        className="icon-disc mb-5 flex h-16 w-16 items-center justify-center rounded-full"
      >
        <Icon size={30} />
      </div>
      <h1 className="font-display text-2xl font-semibold" style={{ color: "var(--primary-strong)" }}>
        {content.title}
      </h1>
      <p className="text-muted mt-3 max-w-sm text-sm">{content.body}</p>
      <Link href="/" className="btn-primary mt-8 rounded-xl px-5 py-2.5 font-semibold">
        Retour à Jungly
      </Link>
    </div>
  );
}
