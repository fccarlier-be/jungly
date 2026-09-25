"use client";

import { HEALTH_COLOR, HEALTH_LABEL, HEALTH_LEVELS, type HealthLevel } from "@/lib/plantHealth";
import { SYMPTOM_CATEGORIES, SYMPTOM_CATEGORY_LABEL, type SymptomCategory } from "@/server/diagnosis/types";

/** Pastille de couleur d'un niveau de sante. */
export function HealthDot({ level, size = 10 }: { level: HealthLevel; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: HEALTH_COLOR[level] }} />;
}

/** Choix du niveau de sante (5 niveaux) -- un second tap sur le niveau choisi le deselectionne. */
export function HealthLevelPicker({
  value,
  onChange,
  disabled,
}: {
  value: HealthLevel | null;
  onChange: (level: HealthLevel | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="État de santé">
      {HEALTH_LEVELS.map((level) => {
        const active = value === level;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(active ? null : level)}
            className="chip flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium leading-tight"
            style={active ? { borderColor: HEALTH_COLOR[level], background: `color-mix(in srgb, ${HEALTH_COLOR[level]} 16%, transparent)` } : undefined}
          >
            <HealthDot level={level} size={12} />
            {HEALTH_LABEL[level]}
          </button>
        );
      })}
    </div>
  );
}

// OTHER exclu : la note libre joue deja ce role.
const PICKABLE_SYMPTOMS = SYMPTOM_CATEGORIES.filter((s) => s !== "OTHER");

/** Symptomes observes (cases a cocher), stockes dans CareEvent.metadata.symptoms. */
export function SymptomPicker({
  value,
  onChange,
  disabled,
}: {
  value: SymptomCategory[];
  onChange: (symptoms: SymptomCategory[]) => void;
  disabled?: boolean;
}) {
  function toggle(symptom: SymptomCategory) {
    onChange(value.includes(symptom) ? value.filter((s) => s !== symptom) : [...value, symptom]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {PICKABLE_SYMPTOMS.map((symptom) => (
        <button
          key={symptom}
          type="button"
          disabled={disabled}
          aria-pressed={value.includes(symptom)}
          onClick={() => toggle(symptom)}
          className={`chip rounded-full px-2.5 py-1 text-xs ${value.includes(symptom) ? "chip-active" : ""}`}
        >
          {SYMPTOM_CATEGORY_LABEL[symptom]}
        </button>
      ))}
    </div>
  );
}
