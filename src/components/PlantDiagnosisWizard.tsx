"use client";

import { useState } from "react";
import { Camera, Loader2 } from "@/components/icons";
import {
  SYMPTOM_CATEGORIES,
  SYMPTOM_CATEGORY_LABEL,
  type SymptomCategory,
  type QcmQuestion,
  type QcmAnswers,
  type PhotoRequest,
  type DiagnosisResult,
} from "@/server/diagnosis/types";

type Step = "category" | "questions" | "photos";

/**
 * Assistant de diagnostic en 3 etapes (categorie -> questions de suivi
 * adaptatif -> photos guidees). State machine simple en useState : le flux
 * est lineaire, chaque etape depend directement de la reponse HTTP de la
 * precedente, pas besoin d'une lib de state machine pour ca. Le resultat
 * final est remonte au parent via onResult plutot qu'affiche ici -- ce
 * composant ne connait que le questionnaire, jamais la mise en forme du
 * resultat (separation avec DiagnosisResult.tsx).
 */
export default function PlantDiagnosisWizard({
  plantId,
  onResult,
}: {
  plantId: string;
  onResult: (result: DiagnosisResult) => void;
}) {
  const [step, setStep] = useState<Step>("category");
  const [category, setCategory] = useState<SymptomCategory | null>(null);
  const [questions, setQuestions] = useState<QcmQuestion[]>([]);
  const [answers, setAnswers] = useState<QcmAnswers>({});
  const [photoRequests, setPhotoRequests] = useState<PhotoRequest[]>([]);
  const [files, setFiles] = useState<Record<string, File>>({});

  // Trois etats de chargement distincts (plutot qu'un seul "busy") pour
  // pouvoir afficher un message different et pertinent a chaque etape --
  // notamment "Analyse en cours..." qui doit rester visible plusieurs
  // secondes pendant l'appel Pl@ntNet cote serveur, pas juste un bouton
  // desactive silencieusement.
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingPhotoPlan, setLoadingPhotoPlan] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchPhotoRequests(cat: SymptomCategory, ans: QcmAnswers) {
    setLoadingPhotoPlan(true);
    setError(null);
    try {
      const res = await fetch("/api/plants/diagnose/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: cat, answers: ans }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Impossible de déterminer les photos nécessaires.");
      setPhotoRequests(body.photos ?? []);
      setFiles({});
      setStep("photos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setLoadingPhotoPlan(false);
    }
  }

  async function selectCategory(cat: SymptomCategory) {
    setCategory(cat);
    setAnswers({});
    setLoadingQuestions(true);
    setError(null);
    try {
      const res = await fetch(`/api/plants/diagnose/questions?category=${encodeURIComponent(cat)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Impossible de charger les questions.");
      const qs: QcmQuestion[] = body.questions ?? [];
      setQuestions(qs);
      if (qs.length === 0) {
        // Pas de question de suivi pour cette categorie : on saute
        // directement a l'etape photos avec des reponses vides.
        await fetchPhotoRequests(cat, {});
      } else {
        setStep("questions");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setLoadingQuestions(false);
    }
  }

  function selectOption(question: QcmQuestion, optionId: string) {
    setAnswers((prev) => {
      if (question.multiple) {
        const current = Array.isArray(prev[question.id]) ? (prev[question.id] as string[]) : [];
        const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
        return { ...prev, [question.id]: next };
      }
      return { ...prev, [question.id]: optionId };
    });
  }

  function isAnswered(question: QcmQuestion): boolean {
    const value = answers[question.id];
    if (question.multiple) return Array.isArray(value) && value.length > 0;
    return typeof value === "string" && value.length > 0;
  }

  function handlePhotoFile(photoId: string, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Permet de reprendre la meme photo si le resultat ne convient pas.
    event.target.value = "";
    if (!file) return;
    setFiles((prev) => ({ ...prev, [photoId]: file }));
  }

  async function submitDiagnosis() {
    if (!category) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("category", category);
      formData.append("answers", JSON.stringify(answers));
      for (const photoRequest of photoRequests) {
        const file = files[photoRequest.id];
        if (file) formData.append(`photo_${photoRequest.id}`, file);
      }
      const res = await fetch(`/api/plants/${plantId}/diagnose`, { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Le diagnostic a échoué.");
      onResult(body as DiagnosisResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSubmitting(false);
    }
  }

  const missingRequiredPhoto = photoRequests.some((pr) => pr.required && !files[pr.id]);
  const allQuestionsAnswered = questions.every(isAnswered);

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {step === "category" && (
        <div className="space-y-3">
          <p className="text-muted text-sm">Quel symptôme observes-tu sur ta plante ?</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SYMPTOM_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                disabled={loadingQuestions || loadingPhotoPlan}
                onClick={() => selectCategory(cat)}
                className="card flex items-center justify-center p-3.5 text-center text-sm font-medium disabled:opacity-60"
                style={category === cat ? { borderColor: "var(--primary)", background: "var(--primary-soft)", color: "var(--primary-strong)" } : undefined}
              >
                {SYMPTOM_CATEGORY_LABEL[cat]}
              </button>
            ))}
          </div>
          {(loadingQuestions || loadingPhotoPlan) && (
            <p className="text-muted flex items-center gap-1.5 text-sm">
              <Loader2 size={14} className="animate-spin" /> Chargement...
            </p>
          )}
        </div>
      )}

      {step === "questions" && (
        <div className="space-y-3">
          {questions.map((q) => (
            <div key={q.id} className="card space-y-2 p-4">
              <p className="text-sm font-medium">{q.question}</p>
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => {
                  const value = answers[q.id];
                  const isSelected = q.multiple ? Array.isArray(value) && value.includes(opt.id) : value === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => selectOption(q, opt.id)}
                      className={`chip rounded-full px-3 py-1.5 text-sm ${isSelected ? "chip-active" : ""}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => fetchPhotoRequests(category as SymptomCategory, answers)}
            disabled={!allQuestionsAnswered || loadingPhotoPlan}
            className="btn-primary w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {loadingPhotoPlan ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin" /> Chargement...
              </span>
            ) : (
              "Suivant"
            )}
          </button>
        </div>
      )}

      {step === "photos" && (
        <div className="space-y-3">
          <p className="text-muted text-sm">Prends les photos demandées pour affiner le diagnostic.</p>
          {photoRequests.map((photoRequest) => (
            <div key={photoRequest.id} className="card space-y-2 p-3.5">
              <p className="text-sm font-medium">
                {photoRequest.label}
                {!photoRequest.required && <span className="text-muted font-normal"> (optionnel)</span>}
              </p>
              <div className="flex items-center gap-2">
                <label>
                  <span className="chip inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm">
                    <Camera size={14} />
                    {files[photoRequest.id] ? "Reprendre la photo" : "Prendre une photo"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={submitting}
                    onChange={(e) => handlePhotoFile(photoRequest.id, e)}
                  />
                </label>
                {files[photoRequest.id] && (
                  <span className="text-xs" style={{ color: "var(--primary-strong)" }}>
                    {files[photoRequest.id].name}
                  </span>
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={submitDiagnosis}
            disabled={missingRequiredPhoto || submitting}
            className="btn-primary w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin" /> Analyse en cours... (ça peut prendre quelques secondes)
              </span>
            ) : (
              "Lancer le diagnostic"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
