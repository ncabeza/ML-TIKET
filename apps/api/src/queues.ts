import {
  ColumnClassification,
  ImportArtifact,
  ImportJob,
  GeolocationValidation,
  MissingnessDetectionResult,
  POSDetection,
  PreviewPayload,
  TicketTitleHint,
  TemplateSuggestionResult,
  TechnicianAssignmentInsight,
} from "@shared/types";
import { attachArtifact, storeInsights } from "./persistence";
import { requestNormalize, requestPreview } from "./pythonWorkerClient";

function buildFallbackArtifact(job: ImportJob, artifactId?: string): ImportArtifact {
  return {
    _id: artifactId ?? `artifact-${job._id}`,
    job_id: job._id,
    struct_tree: [],
    detected_tables: [],
    anchors: [],
    formula_index: [],
    format_groups: [],
    compressed_representation: { anchorHash: "", formulaFingerprint: "", formatClusters: {} },
  } satisfies ImportArtifact;
}

function buildClassifications(insights?: NonNullable<ImportJob["ml_insights"]>) {
  const inferred = insights?.inferred_field_types ?? {};
  return Object.entries(inferred).map<ColumnClassification>(([column, data]) => ({
    column,
    type: data.type,
    confidence: data.confidence,
    evidence: [],
  }));
}

function buildTemplateSuggestion(
  job: ImportJob,
  insights?: NonNullable<ImportJob["ml_insights"]>
): TemplateSuggestionResult {
  const scores = insights?.template_similarity_scores ?? [];
  const topMatch = scores.at(0);

  return {
    strongMatch: topMatch,
    suggestions: scores,
    proposeNewTemplate: !topMatch,
    rationale: topMatch
      ? "Confident match inferred from structural preview."
      : "No confident match detected; propose new template.",
    repeatUploadHint: topMatch
      ? {
          fingerprint: job.structural_artifact_id ?? job._id,
          confirmedDateColumns: [],
          requiredPrompts: [],
          templateExistsOnPlatform: true,
          note: "Derived from template similarity scores.",
        }
      : undefined,
    technicianSummary: insights?.technician_assignment?.notes?.[0] ?? "Pending technician review.",
    nextSteps: insights?.technician_assignment?.notes,
  } satisfies TemplateSuggestionResult;
}

function buildMissingness(
  insights?: NonNullable<ImportJob["ml_insights"]>
): MissingnessDetectionResult {
  const profile =
    insights?.missingness_profile ??
    ({ signal: "MAR", confidence: 0.5, imputation_permitted: false, blockers: [] } satisfies MissingnessDetectionResult["profile"]);

  return {
    profile,
    notes: profile.blockers ?? [],
  } satisfies MissingnessDetectionResult;
}

function buildTechnicianAssignment(
  insights?: NonNullable<ImportJob["ml_insights"]>
): TechnicianAssignmentInsight {
  return (
    insights?.technician_assignment ?? {
      matches: [],
      policy: "REVIEW",
      notes: [],
    }
  );
}

function buildPosDetection(insights?: NonNullable<ImportJob["ml_insights"]>): POSDetection {
  return (
    insights?.pos_detection ?? {
      column: undefined,
      confidence: 0,
      sample_values: [],
      normalized_samples: [],
      missing_required: true,
      warnings: ["No POS column detected; user confirmation required before running."],
    }
  );
}

function buildGeolocation(
  insights?: NonNullable<ImportJob["ml_insights"]>
): GeolocationValidation {
  return (
    insights?.geolocation_validation ?? {
      address_column: undefined,
      latitude_column: undefined,
      longitude_column: undefined,
      confidence: 0,
      ok: false,
      issues: ["No address or POS detected; geolocation unavailable until provided."],
    }
  );
}

function buildTicketTitleHint(
  insights?: NonNullable<ImportJob["ml_insights"]>
): TicketTitleHint {
  return (
    insights?.ticket_title_hint ?? {
      template: "Ticket sin POS - completa el número antes de asignar",
      rationale:
        "No se encontró el número de POS en el Excel; se fuerza al usuario a completarlo antes de crear el ticket.",
    }
  );
}

export async function queuePreviewJob(job: ImportJob): Promise<PreviewPayload> {
  const result = await requestPreview(job);

  if (result.structural_artifact_id) {
    await attachArtifact(job._id, result.structural_artifact_id);
  }

  if (result.ml_insights) {
    await storeInsights(job._id, result.ml_insights);
  }

  const artifact = buildFallbackArtifact(job, result.structural_artifact_id);
  const classifications = buildClassifications(result.ml_insights);
  const templateSuggestion = buildTemplateSuggestion(job, result.ml_insights);
  const missingness = buildMissingness(result.ml_insights);
  const technicianAssignment = buildTechnicianAssignment(result.ml_insights);
  const posDetection = buildPosDetection(result.ml_insights);
  const geolocation = buildGeolocation(result.ml_insights);
  const ticketTitleHint = buildTicketTitleHint(result.ml_insights);

  return {
    job: { ...job, status: "PREVIEW_READY" },
    artifact,
    classifications,
    templateSuggestion,
    missingness,
    technicianAssignment,
    posDetection,
    geolocation,
    ticketTitleHint,
  } satisfies PreviewPayload;
}

export async function queueRunJob(job: ImportJob, sheet?: string) {
  const result = await requestNormalize(job, sheet);

  await storeInsights(job._id, {
    normalized_preview: result.sheets,
    normalization_metadata: result.metadata,
  });

  return result;
}
