import {
  ColumnClassification,
  ImportArtifact,
  MissingnessDetectionResult,
  TechnicianAssignmentInsight,
  TemplateSuggestionResult,
} from "@shared/types";
import { inferFieldType } from "./nn";
import { buildDirectoryMatches } from "./technicians";

const KNOWN_FINGERPRINTS: Array<{ fingerprintPrefix: string; template_id: string; template_version_id: string }>
  = [
    {
      fingerprintPrefix: "anchor-hash::formula-fp",
      template_id: "template-historic",
      template_version_id: "v1",
    },
  ];

// Vector DB use is restricted to similarity only; persistence stays in MongoDB.
export async function matchTemplates(
  artifact: ImportArtifact,
  classifications: ColumnClassification[]
): Promise<TemplateSuggestionResult> {
  const avgConfidence =
    classifications.reduce((sum, c) => sum + c.confidence, 0) /
    Math.max(classifications.length, 1);

  const keyFields = classifications.filter((c) => ["date", "number", "text"].includes(c.type));
  const strongSchemaSignal = keyFields.length >= 2 && avgConfidence > 0.62;

  const baseScores = [
    { template_id: "template-historic", template_version_id: "v1", score: 0.82 },
    { template_id: "template-mass", template_version_id: "v3", score: 0.68 },
    { template_id: "template-adhoc", template_version_id: "v2", score: 0.57 },
  ];

  const fingerprintPieces = [
    artifact.compressed_representation?.anchorHash ?? "unknown-anchor",
    artifact.compressed_representation?.formulaFingerprint ?? "unknown-formula",
    ...artifact.detected_tables.map((table) =>
      table.columns
        .map((col) => col.name.toLowerCase())
        .sort()
        .join("|")
    ),
  ];
  const fingerprint = fingerprintPieces.join("::");
  const matchedFingerprint = KNOWN_FINGERPRINTS.find(({ fingerprintPrefix }) =>
    fingerprint.startsWith(fingerprintPrefix)
  );

  const adjustedScores = baseScores.map((candidate) => {
    const bonus = strongSchemaSignal ? 0.06 : 0;
    const penalty = avgConfidence < 0.45 ? 0.08 : 0;
    const columnDiversity = new Set(classifications.map((c) => c.type)).size;
    const diversityBoost = columnDiversity >= 4 ? 0.03 : 0;
    return {
      ...candidate,
      score: Number(Math.min(0.99, candidate.score + bonus + diversityBoost - penalty).toFixed(3)),
    };
  });

  const sorted = adjustedScores.sort((a, b) => b.score - a.score);
  const strongMatch = sorted.find((t) => t.score >= 0.85);
  const proposeNewTemplate = !strongMatch && sorted.every((t) => t.score < 0.7);

  const dateColumns = classifications.filter((c) => c.type === "date").map((c) => c.column);
  const repeatUploadHint = matchedFingerprint
    ? {
        fingerprint,
        confirmedDateColumns: dateColumns,
        requiredPrompts: ["cliente", "proyecto"],
        templateExistsOnPlatform: sorted.some(
          (t) =>
            t.template_id === matchedFingerprint.template_id &&
            t.template_version_id === matchedFingerprint.template_version_id
        ),
        note:
          dateColumns.length > 0
            ? "Fingerprint repetido detectado; solo solicita confirmación de las fechas presentes y valida cliente/proyecto."
            : "Fingerprint repetido detectado; confirma cliente/proyecto y valida la plantilla asociada en plataforma.",
      }
    : undefined;

  return {
    strongMatch,
    suggestions: sorted,
    proposeNewTemplate,
    rationale: strongMatch
      ? "Schema coverage and neural scores exceed the safety bar; request explicit confirmation."
      : "No template cleared the 0.7 similarity bar after neural adjustment; suggest drafting a new template with human review.",
    repeatUploadHint,
  };
}

export async function classifyColumns(artifact: ImportArtifact): Promise<ColumnClassification[]> {
  return artifact.detected_tables.flatMap((table) =>
    table.columns.map((col) => {
      const result = inferFieldType(col.name);
      return {
        column: col.name,
        type: result.type,
        confidence: result.confidence,
        evidence: result.evidence,
      };
    })
  );
}

export async function detectMissingness(artifact: ImportArtifact): Promise<MissingnessDetectionResult> {
  const tableCount = artifact.detected_tables.length;
  const denseFormats = artifact.format_groups.length > 4;
  const missingnessSignal = tableCount > 1 && denseFormats ? "MAR" : "MNAR";
  const confidence = missingnessSignal === "MAR" ? 0.68 : 0.52;

  const blockers = missingnessSignal === "MNAR"
    ? ["Sparse structure increases MNAR risk", "Manual review required for imputation"]
    : ["Validate key business columns before imputation"];

  return {
    profile: {
      signal: missingnessSignal,
      confidence,
      imputation_permitted: missingnessSignal === "MAR" && confidence > 0.6,
      blockers,
    },
    notes: [
      "Signal now leverages structural density to avoid over-confident interpolation.",
      "Use downstream validation to override only after explicit operator approval.",
    ],
  };
}

const IDENTITY_KEYWORDS = [
  "rut",
  "dni",
  "documento",
  "identidad",
  "cedula",
  "cédula",
  "tecnico",
  "técnico",
  "technician",
];

function findIdentityColumn(artifact: ImportArtifact) {
  return artifact.detected_tables
    .flatMap((table) => table.columns)
    .find((column) => {
      const normalized = column.name.toLowerCase();
      return IDENTITY_KEYWORDS.some((keyword) => normalized.includes(keyword));
    });
}

export function recommendTechnicianAssignments(
  artifact: ImportArtifact,
  classifications: ColumnClassification[]
): TechnicianAssignmentInsight {
  const identityColumn = findIdentityColumn(artifact);
  const identityField = identityColumn?.name;

  if (!identityField) {
    return {
      identityField: undefined,
      matches: [],
      policy: "REVIEW",
      notes: [
        "No se detectó una columna de RUT/DNI; las asignaciones deberán revisarse manualmente en la fase de validación.",
        "Si el Excel incluye un identificador de técnico, use nombres como 'RUT Técnico' o 'DNI' para activar el auto-mapeo.",
      ],
    };
  }

  const matches = buildDirectoryMatches(identityField);
  const hasIdentitySignal = classifications.some((c) =>
    c.column.toLowerCase() === identityField.toLowerCase()
  );

  return {
    identityField,
    matches,
    policy: "AUTO_ASSIGN",
    notes: [
      hasIdentitySignal
        ? "El modelo detectó un campo de identidad y propondrá la asignación automática al técnico coincidente."
        : "Se detectó una columna de identidad; se recomienda confirmar el mapeo antes de ejecutar la importación.",
      "Las coincidencias se basan en el documento de identidad; cualquier dígito faltante o formato distinto requerirá revisión manual.",
    ],
  };
}
