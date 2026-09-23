"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReportHandleButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handle() {
    setPending(true);
    try {
      await fetch(`/api/cuttings/reports/${reportId}/handle`, { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button type="button" onClick={handle} disabled={pending} className="btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60">
      {pending ? "..." : "Marquer comme traité"}
    </button>
  );
}
