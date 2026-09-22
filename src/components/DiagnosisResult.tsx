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

function HypothesisList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-muted text-xs font-medium uppercase tracking-wide">{title}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-sm">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function HypothesisCard({ hypothesis }: { hypothesis: Hypothesis }) {
  return (
    <div className="card space-y-2.5 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{hypothesis.label}</h3>
        <ConfidenceBadge confidence={hypothesis.confidence} />
      </div>
      <HypothesisList title="Éléments en faveur" items={hypothesis.evidenceFor} />
      <HypothesisList title="Éléments qui contredisent" items={hypothesis.evidenceAgainst} />
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
        <section className="card space-y-2 border p-4" style={{ borderColor: "var(--warning)" }}>
          <div>
            <h2 className="font-semibold">Résultat visuel Pl@ntNet</h2>
            <p className="text-muted text-xs">(une piste parmi d&apos;autres, pas une conclusion)</p>
          </div>
          {plantnetDisease.length === 0 ? (
            <p className="text-muted text-sm">Aucun signe de maladie détecté visuellement.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {plantnetDisease.map((candidate) => (
                <li key={candidate.name} className="flex items-center justify-between gap-2">
                  <span>
                    {candidate.name}
                    {candidate.eppoCode && <span className="text-muted"> ({candidate.eppoCode})</span>}
                  </span>
                  <span className="text-muted text-xs shrink-0">{Math.round(candidate.score * 100)}%</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Hypothèses</h2>
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
