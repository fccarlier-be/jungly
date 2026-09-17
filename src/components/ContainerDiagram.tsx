"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { checkContainerCompatibility, type CompatibilityPlant } from "@/lib/containerCompatibility";

export interface ContainerPlantMarker extends CompatibilityPlant {
  positionX: number;
  positionY: number;
}

export type UnassignedPlant = CompatibilityPlant;

interface Props {
  containerId: string;
  shape: "ROUND" | "RECTANGULAR";
  lengthMm: number | null;
  widthMm: number | null;
  plants: ContainerPlantMarker[];
  unassignedPlants: UnassignedPlant[];
}

const VIEW_W = 400;

/**
 * Ramene un point (0-1, 0-1) dans les limites reelles de la forme -- pour un
 * pot rond, ce n'est pas le carre englobant mais le cercle inscrit : sans
 * ca, un marqueur pourrait se retrouver visuellement hors du pot.
 */
function clampToShape(x: number, y: number, shape: "ROUND" | "RECTANGULAR"): { x: number; y: number } {
  const clampedX = Math.min(1, Math.max(0, x));
  const clampedY = Math.min(1, Math.max(0, y));
  if (shape !== "ROUND") {
    return { x: clampedX, y: clampedY };
  }
  const dx = clampedX - 0.5;
  const dy = clampedY - 0.5;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= 0.5) {
    return { x: clampedX, y: clampedY };
  }
  const ratio = 0.5 / dist;
  return { x: 0.5 + dx * ratio, y: 0.5 + dy * ratio };
}

/**
 * Schema a l'echelle reelle de la jardiniere (phase 2, retour beta
 * 2026-09-17) : chaque plante rattachee est un marqueur deplacable par
 * glisser (Pointer Events -- fonctionne pareil a la souris et au doigt,
 * contrairement au Drag and Drop HTML5 natif mal supporte sur mobile).
 * Assigner une plante non rattachee se fait en deux temps (selection puis
 * clic/tap sur le schema) plutot qu'un glisser-depose entre deux zones
 * separees, plus fiable sur tactile.
 */
export default function ContainerDiagram({ containerId, shape, lengthMm, widthMm, plants: initialPlants, unassignedPlants: initialUnassigned }: Props) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const [plants, setPlants] = useState(initialPlants);
  const [unassigned, setUnassigned] = useState(initialUnassigned);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const viewH = shape === "ROUND" ? VIEW_W : lengthMm && widthMm ? Math.round(VIEW_W * (widthMm / lengthMm)) : 300;

  const pointFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return clampToShape((clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height, shape);
    },
    [shape],
  );

  const commitPosition = useCallback(
    async (plantId: string, x: number, y: number) => {
      const res = await fetch(`/api/plants/${plantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ containerId, positionX: x, positionY: y }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Impossible d'enregistrer la position.");
        router.refresh();
      }
    },
    [containerId, router],
  );

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!draggingId) return;
    const point = pointFromClient(e.clientX, e.clientY);
    if (!point) return;
    setPlants((prev) => prev.map((p) => (p.id === draggingId ? { ...p, positionX: point.x, positionY: point.y } : p)));
  }

  function handlePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (draggingId) {
      const id = draggingId;
      const point = pointFromClient(e.clientX, e.clientY);
      setDraggingId(null);
      if (point) commitPosition(id, point.x, point.y);
      return;
    }
    if (placingId) {
      const point = pointFromClient(e.clientX, e.clientY);
      const plant = unassigned.find((p) => p.id === placingId);
      setPlacingId(null);
      if (point && plant) {
        setUnassigned((prev) => prev.filter((p) => p.id !== plant.id));
        setPlants((prev) => [...prev, { ...plant, positionX: point.x, positionY: point.y }]);
        commitPosition(plant.id, point.x, point.y);
      }
    }
  }

  async function detach(plantId: string) {
    setPlants((prev) => prev.filter((p) => p.id !== plantId));
    const removed = plants.find((p) => p.id === plantId);
    const res = await fetch(`/api/plants/${plantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ containerId: null }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Impossible de détacher cette plante.");
      router.refresh();
      return;
    }
    if (removed) {
      setUnassigned((prev) => [
        ...prev,
        { id: removed.id, name: removed.name, substrateType: removed.substrateType, wateringIntervalDays: removed.wateringIntervalDays },
      ]);
    }
  }

  const placingWarnings = placingId
    ? checkContainerCompatibility([...plants, ...unassigned.filter((p) => p.id === placingId)])
    : [];

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {placingId && (
        <div className="space-y-1.5 rounded-lg px-3 py-2" style={{ background: "var(--primary-soft)", color: "var(--primary-strong)" }}>
          <p className="text-sm">
            Touchez ou cliquez à l&apos;endroit du schéma où se trouve « {unassigned.find((p) => p.id === placingId)?.name} ».
          </p>
          {placingWarnings.map((w) => (
            <p key={w.kind} className="text-xs" style={{ color: "var(--warning)" }}>
              ⚠ {w.message}
            </p>
          ))}
        </div>
      )}

      <div className="card p-3">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${viewH}`}
          className="w-full touch-none select-none"
          style={{ maxHeight: 360, cursor: placingId ? "crosshair" : undefined }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={(e) => draggingId && handlePointerUp(e)}
        >
          {shape === "ROUND" ? (
            <circle cx={VIEW_W / 2} cy={viewH / 2} r={Math.min(VIEW_W, viewH) / 2 - 4} fill="var(--surface-alt)" stroke="var(--border)" strokeWidth={2} />
          ) : (
            <rect x={2} y={2} width={VIEW_W - 4} height={viewH - 4} rx={10} fill="var(--surface-alt)" stroke="var(--border)" strokeWidth={2} />
          )}

          {plants.map((p) => (
            <g
              key={p.id}
              transform={`translate(${p.positionX * VIEW_W}, ${p.positionY * viewH})`}
              onPointerDown={(e) => {
                e.stopPropagation();
                setDraggingId(p.id);
              }}
              style={{ cursor: "grab" }}
            >
              <circle r={14} fill="var(--primary)" stroke="var(--primary-ink)" strokeWidth={2} />
              <text y={28} textAnchor="middle" fontSize={13} fill="var(--ink)" fontWeight={600}>
                {p.name}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {plants.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted uppercase tracking-wide">Dans cette jardinière</p>
          {plants.map((p) => (
            <div key={p.id} className="card flex items-center justify-between p-2.5 text-sm">
              <span>{p.name}</span>
              <button onClick={() => detach(p.id)} className="chip rounded-lg px-2.5 py-1 text-xs">
                Détacher
              </button>
            </div>
          ))}
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted uppercase tracking-wide">Plantes disponibles</p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((p) => (
              <button
                key={p.id}
                onClick={() => setPlacingId(placingId === p.id ? null : p.id)}
                className="chip rounded-lg px-3 py-1.5 text-sm"
                style={
                  placingId === p.id
                    ? { background: "var(--primary)", color: "var(--primary-ink)", borderColor: "var(--primary)" }
                    : undefined
                }
              >
                + {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
