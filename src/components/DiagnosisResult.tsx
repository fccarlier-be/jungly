import type { DiagnosisConfidence, DiagnosisResult as DiagnosisResultData, Hypothesis } from "@/server/diagnosis/types";

const CONFIDENCE_LABEL: Record<DiagnosisConfidence, string> = {
  PROBABLE: "Probable",
  POSSIBLE: "Possible",
  PEU_PROBABLE: "Peu probable",
};

// Meme principe que .badge-healthy/.badge-watch/.badge-attention dans
// globals.css (fond = couleur attenuee via color-mix, texte = couleur
// pleine) -- en inline ici car il n'existe pas de variante CSS "grise"
// pour PEU_PROBABLE et on ne veut pas ajouter une couleur brute.
const CONFIDENCE_COLOR: Record<DiagnosisConfidence, string> = {
  PROBABLE: "var(--primary)",
  POSSIBLE: "var(--warning)",
  PEU_PROBABLE: "var(--ink-muted)",
};
const CONFIDENCE_TEXT_COLOR: Record<DiagnosisConfidence, string> = {
  PROBABLE: "var(--primary-strong)",
  POSSIBLE: "var(--warning)",
  PEU_PROBABLE: "var(--ink-muted)",
};

function ConfidenceBadge({ confidence }: { confidence: DiagnosisConfidence }) {
  return (
    <span
      className="badge shrink-0"
      style={{
        background: `color-mix(in srgb, ${CONFIDENCE_COLOR[confidence]} 18%, transparent)`,
        color: CONFIDENCE_TEXT_COLOR[confidence],
      }}
    >
      {CONFIDENCE_LABEL[confidence]}
    </span>
  );
}

// Point colore + libelle plutot qu'un simple intitule majuscule : distingue
// "pour" de "contre" au premier coup d'oeil (retour "peu lisible", 2026-09-23)
// sans introduire de nouvelle couleur -- reprend --primary (deja "positif"
// dans le badge PROBABLE) et --danger (deja "attention" dans .badge-attention).
const EVIDENCE_DOT_COLOR: Record<string, string> = {
  for: "var(--primary)",
  against: "var(--danger)",
};

function HypothesisList({ title, items, tone }: { title: string; items: string[]; tone?: "for" | "against" }) {
  if (items.length === 0) return null;
  return (
    <div className="border-t pt-2 first:border-t-0 first:pt-0" style={{ borderColor: "var(--border)" }}>
      <p className="text-muted flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide">
        {tone && <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: EVIDENCE_DOT_COLOR[tone] }} />}
        {title}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function HypothesisCard({ hypothesis }: { hypothesis: Hypothesis }) {
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold">{hypothesis.label}</h3>
        <ConfidenceBadge confidence={hypothesis.confidence} />
      </div>
      <HypothesisList title="Éléments en faveur" items={hypothesis.evidenceFor} tone="for" />
      <HypothesisList title="Éléments qui contredisent" items={hypothesis.evidenceAgainst} tone="against" />
      <HypothesisList title="Vérifications à faire" items={hypothesis.verifications} />
      <HypothesisList title="Actions recommandées" items={hypothesis.actions} />
    </div>
  );
}

/**
 * Affichage du resultat de diagnostic. Trois blocs visuellement distincts
 * par exigence produit explicite : identification / observations /
 * hypotheses ne doivent jamais se melanger (une identification correcte
 * n'est pas une observation, une observation factuelle n'est pas une
 * hypothese). Le resultat visuel Pl@ntNet (le cas echeant) est un encart a
 * part, clairement labellise comme une piste parmi d'autres -- jamais
 * fusionne avec les hypotheses du moteur de regles.
 */
export default function DiagnosisResult({ result }: { result: DiagnosisResultData }) {
  const { plantIdentification, observations, plantnetDisease, hypotheses } = result;

  const sourceLabel =
    plantIdentification.source === "existing"
      ? "Déjà connue"
      : plantIdentification.source === "plantnet"
        ? "Confirmée par Pl@ntNet"
        : null;

  return (
    <div className="space-y-4">
      <section className="card space-y-1 p-4">
        <h2 className="font-semibold">Identification</h2>
        {plantIdentification.commonName || plantIdentification.scientificName ? (
          <>
            <p className="text-sm font-medium">
              {plantIdentification.commonName ?? plantIdentification.scientificName}
            </p>
            {plantIdentification.scientificName && (
              <p className="text-muted text-sm italic">{plantIdentification.scientificName}</p>
            )}
            {sourceLabel && <p className="text-muted text-xs">{sourceLabel}</p>}
          </>
        ) : (
          <p className="text-muted text-sm">Plante non identifiée.</p>
        )}
      </section>

      <section className="card space-y-2 p-4">
        <h2 className="font-semibold">Observations</h2>
        {observations.length === 0 ? (
          <p className="text-muted text-sm">Aucune observation particulière.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {observations.map((obs, i) => (
              <li key={i}>{obs}</li>
            ))}
          </ul>
        )}
      </section>

      {plantnetDisease !== null && (
        <section
          className="card space-y-2.5 p-4"
          style={plantnetDisease.length > 0 ? { borderLeft: "3px solid var(--warning)" } : undefined}
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">Résultat visuel Pl@ntNet</h2>
            <span className="chip shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap">une piste, pas une conclusion</span>
          </div>
          {plantnetDisease.length === 0 ? (
            <p className="text-muted text-sm">Aucun signe de maladie détecté visuellement.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {plantnetDisease.map((candidate) => {
                const percent = Math.round(candidate.score * 100);
                return (
                  <li key={candidate.name} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {candidate.name}
                        {candidate.eppoCode && <span className="text-muted"> ({candidate.eppoCode})</span>}
                      </span>
                      <span className="text-muted shrink-0 text-xs tabular-nums">{percent}%</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                      <div className="h-full rounded-full" style={{ width: `${percent}%`, background: "var(--warning)" }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Hypothèses</h2>
        {hypotheses.length === 0 ? (
          <p className="text-muted text-sm">Aucune hypothèse identifiée.</p>
        ) : (
          <div className="space-y-2.5">
            {hypotheses.map((h) => (
              <HypothesisCard key={h.id} hypothesis={h} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
