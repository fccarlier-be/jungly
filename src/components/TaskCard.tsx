"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Le menu "Reporter" est portale dans document.body (voir plus bas) plutot
  // que positionne en absolute dans la carte : SwipeableCard applique
  // overflow:hidden + transform (necessaires a l'effet de swipe), qui
  // rognent/emprisonnent un enfant absolute dans son propre contexte
  // d'empilement -- le menu s'ouvrait alors sous la carte suivante au lieu
  // de passer au premier plan, quel que soit son z-index (bug signale
  // par l'utilisateur).
  function toggleMenu() {
    if (!menuOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setMenuOpen((open) => !open);
  }

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    // Fermeture plutot que repositionnement au scroll/resize : plus simple
    // qu'un recalcul en continu pour un menu qui ne reste ouvert que
    // quelques secondes.
    function close() {
      setMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menuOpen]);

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
      setDone(true);
      await new Promise((resolve) => setTimeout(resolve, 320));
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function snooze(until: Date) {
    setPending(true);
    setError(null);
    try {
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

  function snoozeDays(days: number) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    setMenuOpen(false);
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
    <>
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
          className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl"
          style={{ background: "var(--surface-alt)" }}
        >
          {task.plantImage ? (
            <Image
              src={task.plantImage}
              alt=""
              fill
              sizes="56px"
              className="object-cover"
              unoptimized={task.plantImage.startsWith("http")}
            />
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
          <button
            ref={buttonRef}
            type="button"
            onClick={toggleMenu}
            className="chip cursor-pointer rounded-xl px-3 py-2.5 text-sm"
          >
            Reporter
          </button>
        </div>
        {error && (
          <p role="alert" className="pt-2 text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
    </SwipeableCard>
    {menuOpen && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            className="card fixed z-50 w-48 space-y-1 p-2"
            style={{ top: menuPosition.top, right: menuPosition.right }}
          >
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
                onClick={() => {
                  if (!customDate) return;
                  setMenuOpen(false);
                  void snooze(new Date(customDate));
                }}
                disabled={!customDate}
                className="chip rounded-lg px-2 text-sm disabled:opacity-50"
              >
                OK
              </button>
            </div>
          </div>,
          document.body,
        )
      : null}
    </>
  );
}
