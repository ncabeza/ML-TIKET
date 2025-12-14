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

  const adjustedScores = baseScores
    .map((candidate) => {
      const bonus = strongSchemaSignal ? 0.06 : 0;
      const penalty = avgConfidence < 0.45 ? 0.08 : 0;
      const columnDiversity = new Set(classifications.map((c) => c.type)).size;
      const diversityBoost = columnDiversity >= 4 ? 0.03 : 0;
      const fingerprintBoost =
        matchedFingerprint &&
        candidate.template_id === matchedFingerprint.template_id &&
        candidate.template_version_id === matchedFingerprint.template_version_id
          ? 0.12
          : 0;

      const boostedScore = Math.min(
        0.99,
        candidate.score + bonus + diversityBoost + fingerprintBoost - penalty
      );

      return {
        ...candidate,
        score: Number(boostedScore.toFixed(3)),
        fingerprintHit: fingerprintBoost > 0,
      };
    })
    .sort((a, b) => b.score - a.score);

  const strongMatch =
    adjustedScores.find((candidate) => candidate.fingerprintHit) ??
    adjustedScores.find((t) => t.score >= 0.85);
  const proposeNewTemplate = !strongMatch && adjustedScores.every((t) => t.score < 0.7);

  const topCandidate = strongMatch ?? adjustedScores[0];
  const friendlyScore = topCandidate ? Math.round(topCandidate.score * 100) : undefined;
  const technicianSummary = topCandidate
    ? `Detectamos que el Excel se parece a la plantilla ${topCandidate.template_id} (v${topCandidate.template_version_id}) con una coincidencia aproximada del ${friendlyScore}%. Te dejamos el mapeo sugerido para que sólo ajustes lo necesario y confirmes antes de crear tickets.`
    : "No encontramos coincidencias sólidas; proponemos crear una nueva plantilla y mapear las columnas críticas con el operador.";

  const dateColumns = classifications.filter((c) => c.type === "date").map((c) => c.column);
  const repeatUploadHint = matchedFingerprint
    ? {
        fingerprint,
        confirmedDateColumns: dateColumns,
        requiredPrompts: ["cliente", "proyecto"],
        templateExistsOnPlatform: adjustedScores.some(
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

  const nextSteps: string[] = [];
  if (topCandidate) {
    nextSteps.push(
      "Valida que los encabezados y las fechas claves coincidan con la plantilla sugerida; ajusta nombres si hace falta."
    );
  }
  if (repeatUploadHint) {
    nextSteps.push(
      repeatUploadHint.note,
      "Confirma los campos de cliente y proyecto antes de enviar a ejecución para evitar rebotes."
    );
  }
  if (proposeNewTemplate) {
    nextSteps.push(
      "Sin una coincidencia fuerte, crea un borrador de plantilla nueva y pídele a un líder técnico que la apruebe."
    );
  }

  return {
    strongMatch,
    suggestions: adjustedScores,
    proposeNewTemplate,
    rationale: strongMatch
      ? matchedFingerprint
        ? "Fingerprint y estructura coinciden con una plantilla conocida; prioriza la reutilización con confirmación explícita."
        : "Schema coverage and neural scores exceed the safety bar; request explicit confirmation."
      : "No template cleared the 0.7 similarity bar after neural adjustment; suggest drafting a new template with human review.",
    repeatUploadHint,
    technicianSummary,
    nextSteps,
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
  const columnCount = artifact.detected_tables.reduce(
    (sum, table) => sum + table.columns.length,
    0
  );
  const anchorCount = artifact.anchors.length;
  const formatGroups = artifact.format_groups.length;
  const formulaSignals = artifact.formula_index.length;

  const structuralDensity =
    (tableCount > 1 ? 0.2 : 0.12) +
    Math.min(anchorCount, 3) * 0.08 +
    Math.min(formatGroups, 5) * 0.05 +
    (formulaSignals > 0 ? 0.08 : 0);
  const volumeBoost = columnCount >= 8 ? 0.2 : columnCount >= 4 ? 0.1 : 0.04;
  const confidence = Number(
    Math.min(0.95, Math.max(0.35, structuralDensity + volumeBoost)).toFixed(2)
  );

  const sparseLayout = columnCount < 3 || tableCount === 0;
  const missingnessSignal = confidence < 0.5 || sparseLayout ? "MNAR" : confidence > 0.72 ? "MAR" : "MCAR";
  const imputationPermitted = missingnessSignal !== "MNAR" && confidence >= 0.58;

  const blockers: string[] = [];
  if (missingnessSignal === "MNAR") {
    blockers.push("Estructura insuficiente o tablas vacías detectadas; requiere revisión manual.");
  }
  if (!imputationPermitted) {
    blockers.push("La confianza del perfil no alcanza el umbral seguro para imputación automática.");
  }
  if (anchorCount === 0) {
    blockers.push("No se encontraron encabezados ancla para validar columnas obligatorias.");
  }
  if (formatGroups <= 1) {
    blockers.push("Pocas señales de formato; no se pueden distinguir secciones críticas.");
  }

  return {
    profile: {
      signal: missingnessSignal,
      confidence,
      imputation_permitted: imputationPermitted,
      blockers,
    },
    notes: [
      "El perfil considera densidad estructural (anclas, fórmulas, formatos) para evitar imputaciones optimistas.",
      "Solo habilita imputación cuando la señal es consistente y supera el umbral de confianza acordado con QA.",
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
