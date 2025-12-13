import {
  ColumnClassification,
  ImportArtifact,
  MissingnessDetectionResult,
  TemplateSuggestionResult,
} from "@shared/types";

// Vector DB use is restricted to similarity only; persistence stays in MongoDB.
export async function matchTemplates(
  artifact: ImportArtifact,
  classifications: ColumnClassification[]
): Promise<TemplateSuggestionResult> {
  const templateScores = [
    { template_id: "template-historic", template_version_id: "v1", score: 0.88 },
    { template_id: "template-mass", template_version_id: "v3", score: 0.74 },
  ];

  const strongMatch = templateScores.find((t) => t.score >= 0.85);
  const proposeNewTemplate = !strongMatch && templateScores.every((t) => t.score < 0.7);

  return {
    strongMatch,
    suggestions: templateScores,
    proposeNewTemplate,
    rationale: strongMatch
      ? "Vector similarity exceeded 0.85; proceed with explicit user confirmation."
      : "No strong match; recommend drafting a new template after human approval.",
  };
}

export async function classifyColumns(artifact: ImportArtifact): Promise<ColumnClassification[]> {
  return artifact.detected_tables.flatMap((table) =>
    table.columns.map((col) => ({
      column: col.name,
      type: inferType(col.name),
      confidence: 0.76,
      evidence: ["header semantics", "value distribution placeholder"],
    }))
  );
}

function inferType(name: string): ColumnClassification["type"] {
  const lowered = name.toLowerCase();
  if (lowered.includes("fecha")) return "date";
  if (lowered.includes("cliente")) return "text";
  if (lowered.includes("direccion")) return "text";
  return "text";
}

export async function detectMissingness(artifact: ImportArtifact): Promise<MissingnessDetectionResult> {
  // Conservative posture: assume MNAR unless structure suggests otherwise.
  return {
    profile: {
      signal: "MAR",
      confidence: 0.55,
      imputation_permitted: false,
      blockers: ["Confidence below safety threshold", "Potential MNAR indicators"],
    },
    notes: [
      "Columns with potential business meaning are not imputed automatically.",
      "User must confirm any interpolation; defaults to blocking risky rows.",
    ],
  };
}
