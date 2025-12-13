import {
  ColumnClassification,
  ImportArtifact,
  ImportJob,
  MissingnessDetectionResult,
  PreviewPayload,
  TechnicianAssignmentInsight,
  TemplateSuggestionResult,
} from "@shared/types";
import crypto from "crypto";
import { attachArtifact, storeErrorFile, storeInsights, updateJobStatus } from "../../api/src/persistence";
import { parseExcelNative, buildStructuralTree, compressStructure } from "./structure";
import { classifyColumns, detectMissingness, matchTemplates, recommendTechnicianAssignments } from "./semantic";
import { validateHardRules, createTicketsInBatches } from "./tickets";

export function buildPreviewPipeline() {
  return async function runPreview(job: ImportJob): Promise<PreviewPayload> {
    const sheet = await parseExcelNative(job.upload.storageKey);
    const tree = await buildStructuralTree(sheet);
    const compressed = await compressStructure(tree);
    const artifact: ImportArtifact = {
      _id: crypto.randomUUID(),
      job_id: job._id,
      struct_tree: tree.tree,
      detected_tables: tree.tables,
      anchors: compressed.anchors,
      formula_index: compressed.formula_index,
      format_groups: compressed.format_groups,
      compressed_representation: compressed.compressed,
    };

    await attachArtifact(job._id, artifact._id);

    const classifications: ColumnClassification[] = await classifyColumns(artifact);
    const missingness: MissingnessDetectionResult = await detectMissingness(artifact);
    const templateSuggestion: TemplateSuggestionResult = await matchTemplates(artifact, classifications);
    const technicianAssignment: TechnicianAssignmentInsight = recommendTechnicianAssignments(
      artifact,
      classifications
    );

    await storeInsights(job._id, {
      structure_confidence: tree.confidence,
      template_similarity_scores: templateSuggestion.suggestions,
      inferred_field_types: Object.fromEntries(
        classifications.map((c) => [c.column, { type: c.type, confidence: c.confidence }])
      ),
      missingness_profile: missingness.profile,
      technician_assignment: technicianAssignment,
    });

    return {
      job,
      artifact,
      classifications,
      templateSuggestion,
      missingness,
      technicianAssignment,
    };
  };
}

export function buildRunPipeline() {
  return async function run(job: ImportJob) {
    // Confirm template decisions must be present and acknowledged by the user.
    if (!job.template_resolution) {
      throw new Error("Template must be confirmed before running the import");
    }

    const validation = await validateHardRules(job);
    if (!validation.ok) {
      if (validation.errorFileKey) {
        await storeErrorFile(job._id, validation.errorFileKey);
      }
      await updateJobStatus(job._id, "FAILED");
      return validation;
    }

    const result = await createTicketsInBatches(job);
    await updateJobStatus(job._id, "COMPLETED");
    return result;
  };
}
