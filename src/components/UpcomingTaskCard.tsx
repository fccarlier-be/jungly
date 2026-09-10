"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CareTypeIcon, careSoftBackground } from "@/components/careIcons";
import { formatRelativeDueDate } from "@/lib/units";
import SwipeableCard from "@/components/SwipeableCard";

export interface UpcomingTaskData {
  id: string;
  type: string;
  title: string;
  plantName: string;
  effectiveDate: string | Date;
}

export default function UpcomingTaskCard({ task }: { task: UpcomingTaskData }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Impossible de valider cette tâche.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function snoozeOneMoreDay() {
    setPending(true);
    setError(null);
    try {
      // +1 jour depuis la date actuelle de la tache, pas depuis aujourd'hui :
      // pour une echeance deja a plusieurs jours, repartir de "demain"
      // l'aurait rapprochee au lieu de l'eloigner.
      const until = new Date(task.effectiveDate);
      until.setDate(until.getDate() + 1);
      const res = await fetch(`/api/tasks/${task.id}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ until: until.toISOString() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Impossible de reporter cette tâche.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <SwipeableCard onSwipeLeft={complete} onSwipeRight={snoozeOneMoreDay} disabled={pending}>
        <div className="card flex items-center gap-3 px-3 py-2.5">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: careSoftBackground(task.type) }}
          >
            <CareTypeIcon type={task.type} size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{task.plantName}</p>
            <p className="text-muted truncate text-xs">{task.title}</p>
          </div>
          <p className="text-muted shrink-0 text-xs">{formatRelativeDueDate(task.effectiveDate)}</p>
        </div>
      </SwipeableCard>
      {error && (
        <p role="alert" className="px-3 pt-1 text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
