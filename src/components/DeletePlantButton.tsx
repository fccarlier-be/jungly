"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeletePlantButton({ plantId, plantName }: { plantId: string; plantName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Supprimer définitivement "${plantName}" et tout son historique ?`)) {
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/plants/${plantId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/plantes");
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      className="chip w-full rounded-xl py-2.5 text-sm font-medium disabled:opacity-60"
      style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
    >
      {pending ? "Suppression..." : "Supprimer cette plante"}
    </button>
  );
}
