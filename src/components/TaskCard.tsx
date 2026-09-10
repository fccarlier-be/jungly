"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Sprout } from "lucide-react";
import { formatRelativeDueDate } from "@/lib/units";
import { CareTypeIcon, careSoftBackground } from "@/components/careIcons";
import SwipeableCard from "@/components/SwipeableCard";

export interface TaskCardData {
  id: string;
  plantId: string;
  type: "WATERING" | "FERTILIZING" | "REPOTTING" | "PRUNING" | "INSPECTION" | "OTHER";
  title: string;
  dueAt: string | Date;
  plant?: { name: string } | null;
  plantImage?: string | null;
  careRule?: { configuration?: unknown } | null;
  subtitle?: string | null;
}

const COMPLETE_LABEL: Record<string, string> = {
  WATERING: "Arrosée",
  FERTILIZING: "Fertilisée",
  REPOTTING: "Rempotée",
  PRUNING: "Taillée",
  INSPECTION: "Inspectée",
  OTHER: "Terminée",
};

export default function TaskCard({ task, showPlantName = true }: { task: TaskCardData; showPlantName?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [customDate, setCustomDate] = useState("");

  async function complete() {
    setPending(true);
    setDone(true);
    try {
      await fetch(`/api/tasks/${task.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await new Promise((resolve) => setTimeout(resolve, 320));
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function snooze(until: Date) {
    setPending(true);
    try {
      await fetch(`/api/tasks/${task.id}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ until: until.toISOString() }),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function snoozeDays(days: number) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    void snooze(until);
  }

  // Depuis la date actuelle de la tache, pas "demain depuis aujourd'hui" :
  // pour une echeance deja a quelques jours (vue "Prochaines echeances"),
  // swiper devait la repousser d'un jour supplementaire, pas la ramener a
  // demain (ce qui l'aurait rapprochee au lieu de l'eloigner).
  function swipeSnooze() {
    const until = new Date(task.dueAt);
    until.setDate(until.getDate() + 1);
    void snooze(until);
  }

  return (
    <SwipeableCard onSwipeLeft={complete} onSwipeRight={swipeSnooze} disabled={pending}>
    <div
      className="card p-4 transition-all duration-300"
      style={done ? { opacity: 0.4, transform: "scale(0.98)" } : undefined}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: careSoftBackground(task.type) }}
        >
          <CareTypeIcon type={task.type} size={18} />
        </div>
        <Link href={`/plantes/${task.plantId}`} className="block min-w-0 flex-1">
          <p className="text-muted text-sm">{task.title}</p>
          {showPlantName && task.plant?.name && <p className="text-lg font-semibold leading-tight">{task.plant.name}</p>}
          <p className="text-muted text-sm">{formatRelativeDueDate(task.dueAt)}</p>
          {task.subtitle && <p className="text-muted mt-1 text-sm">{task.subtitle}</p>}
        </Link>
        <Link
          href={`/plantes/${task.plantId}`}
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl"
          style={{ background: "var(--surface-alt)" }}
        >
          {task.plantImage ? (
            <img src={task.plantImage} alt="" className="h-full w-full object-cover" />
          ) : (
            <Sprout size={22} strokeWidth={1.5} style={{ color: "var(--secondary)" }} />
          )}
        </Link>
      </div>
      <div className="pl-12">
        <div className="flex gap-2 pt-3">
          <button
            onClick={complete}
            disabled={pending}
            className="btn-primary flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {done ? <Check size={16} className="animate-pop" /> : null}
            {COMPLETE_LABEL[task.type]}
          </button>
          <details className="relative">
            <summary className="chip cursor-pointer list-none rounded-xl px-3 py-2.5 text-sm">Reporter</summary>
            <div className="card absolute right-0 z-10 mt-1 w-48 space-y-1 p-2">
              <button onClick={() => snoozeDays(1)} className="btn-ghost block w-full rounded-lg px-2 py-1.5 text-left text-sm">
                Demain
              </button>
              <button onClick={() => snoozeDays(3)} className="btn-ghost block w-full rounded-lg px-2 py-1.5 text-left text-sm">
                Dans 3 jours
              </button>
              <button onClick={() => snoozeDays(7)} className="btn-ghost block w-full rounded-lg px-2 py-1.5 text-left text-sm">
                Dans 7 jours
              </button>
              <div className="flex gap-1 pt-1">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="input w-full px-1.5 py-1 text-sm"
                />
                <button
                  onClick={() => customDate && snooze(new Date(customDate))}
                  disabled={!customDate}
                  className="chip rounded-lg px-2 text-sm disabled:opacity-50"
                >
                  OK
                </button>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
    </SwipeableCard>
  );
}
