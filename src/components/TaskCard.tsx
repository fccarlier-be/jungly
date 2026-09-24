"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Check, MoreHorizontal } from "@/components/icons";
import { formatRelativeDueDate } from "@/lib/units";
import { CareAvatar } from "@/components/careIcons";
import SwipeableCard from "@/components/SwipeableCard";
import { bypassesImageOptimizer } from "@/lib/imageOptimization";
import { PlantPlaceholder } from "@/components/art/paper";

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

function PlantThumb({ task, size, badge }: { task: TaskCardData; size: number; badge?: boolean }) {
  return (
    <Link
      href={`/plantes/${task.plantId}`}
      className="relative block shrink-0"
      style={{ width: size, height: size }}
      aria-label={task.plant?.name ?? "Voir la plante"}
    >
      <span className="relative block h-full w-full overflow-hidden rounded-xl" style={{ background: "var(--surface-alt)" }}>
        {task.plantImage ? (
          <Image
            src={task.plantImage}
            alt=""
            fill
            sizes={`${size}px`}
            className="object-cover"
            unoptimized={bypassesImageOptimizer(task.plantImage)}
          />
        ) : (
          <PlantPlaceholder className="h-full w-full" />
        )}
      </span>
      {badge && <CareAvatar type={task.type} size={24} className="absolute -bottom-1 -right-1" />}
    </Link>
  );
}

/**
 * Une tache = une ligne, avec SES PROPRES actions (valider, reporter) : dans
 * une carte regroupant plusieurs soins d'une meme plante, valider l'arrosage
 * ne touche jamais a la fertilisation.
 */
function TaskRow({
  task,
  lead,
  primary,
  secondary,
  wrapClass,
  radius,
  testId,
}: {
  task: TaskCardData;
  lead: ReactNode;
  primary: ReactNode;
  secondary: ReactNode;
  wrapClass: string;
  radius: string;
  testId?: string;
}) {
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
      <SwipeableCard onSwipeLeft={complete} onSwipeRight={swipeSnooze} disabled={pending} radius={radius}>
        <div className={wrapClass} data-testid={testId} style={done ? { opacity: 0.4, transform: "scale(0.98)" } : { transition: "all 300ms" }}>
          <div className="flex items-center gap-3">
            {lead}
            <div className="min-w-0 flex-1">
              {primary}
              {secondary}
              {task.subtitle && <p className="text-muted truncate text-xs leading-snug">{task.subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={complete}
              disabled={pending}
              className="btn-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-60"
              style={{ boxShadow: "none" }}
              aria-label={COMPLETE_LABEL[task.type]}
              title={COMPLETE_LABEL[task.type]}
            >
              <Check size={18} className={done ? "animate-pop" : undefined} />
            </button>
            <button
              ref={buttonRef}
              type="button"
              onClick={toggleMenu}
              className="chip flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full"
              aria-label="Reporter"
              title="Reporter"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
          {error && (
            <p role="alert" className="pt-2 text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
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

function dueLabel(task: TaskCardData): ReactNode {
  const due = new Date(task.dueAt);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const overdue = due.getTime() < startOfToday.getTime();
  return (
    <span style={overdue ? { color: "var(--accent)", fontWeight: 600 } : undefined}>{formatRelativeDueDate(task.dueAt)}</span>
  );
}

/**
 * Carte d'une plante : une seule tache = une ligne compacte (photo, nom,
 * soin + echeance, valider, reporter) ; plusieurs taches de la meme plante =
 * un en-tete (photo, nom) puis une ligne par tache, chacune avec ses propres
 * boutons.
 */
export default function TaskCard({ tasks }: { tasks: TaskCardData[] }) {
  const first = tasks[0];
  const plantName = first.plant?.name ?? "";

  if (tasks.length === 1) {
    return (
      <TaskRow
        task={first}
        wrapClass="card-flat p-2.5"
        radius="1.1rem"
        testId="task-card"
        lead={<PlantThumb task={first} size={48} badge />}
        primary={<p className="truncate text-base font-semibold leading-tight">{plantName || first.title}</p>}
        secondary={
          <p className="text-muted truncate text-sm leading-snug">
            {plantName ? `${first.title} · ` : ""}
            {dueLabel(first)}
          </p>
        }
      />
    );
  }

  return (
    <div className="card-flat space-y-1 p-2.5" data-testid="task-card">
      <div className="flex items-center gap-3 pb-1">
        <PlantThumb task={first} size={40} />
        <Link href={`/plantes/${first.plantId}`} className="min-w-0 flex-1 truncate text-base font-semibold leading-tight">
          {plantName}
        </Link>
        <span className="text-muted text-xs">{tasks.length} soins</span>
      </div>
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          wrapClass="rounded-xl bg-[var(--surface)] px-1 py-1.5"
          radius="0.9rem"
          lead={<CareAvatar type={task.type} size={32} />}
          primary={<p className="text-sm font-medium leading-tight">{task.title}</p>}
          secondary={<p className="text-muted text-sm leading-snug">{dueLabel(task)}</p>}
        />
      ))}
    </div>
  );
}
