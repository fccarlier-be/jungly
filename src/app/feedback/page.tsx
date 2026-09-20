import Link from "next/link";
import { requireSessionUserId } from "@/lib/session";
import FeedbackForm from "@/components/FeedbackForm";

export default async function FeedbackPage() {
  await requireSessionUserId();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Donner mon avis</h1>
        <Link href="/parametres" className="text-sm font-medium" style={{ color: "var(--primary-strong)" }}>
          Paramètres
        </Link>
      </div>
      <p className="text-muted text-sm">
        Un bug, une idée, une remarque sur Jungly ? Ton retour est lu directement par le développeur.
      </p>
      <FeedbackForm />
    </div>
  );
}
