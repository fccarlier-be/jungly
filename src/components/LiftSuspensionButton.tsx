"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LiftSuspensionButton({ memberId, pseudo }: { memberId: string; pseudo: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function lift() {
    if (!confirm(`Lever la suspension de ${pseudo} ? Ses avertissements restent comptabilisés.`)) return;
    setPending(true);
    try {
      await fetch(`/api/cuttings/members/${memberId}/lift`, { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button type="button" onClick={lift} disabled={pending} className="btn-ghost rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60">
      Lever la suspension
    </button>
  );
}
