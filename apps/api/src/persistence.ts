import crypto from "crypto";
import { ImportJob, TemplateSuggestionResult } from "@shared/types";

let inMemoryJobs: Record<string, ImportJob> = {};

export async function persistJob(
  partial: Pick<ImportJob, "project_id" | "created_by" | "mode" | "upload">
): Promise<ImportJob> {
  const now = new Date().toISOString();
  const job: ImportJob = {
    _id: crypto.randomUUID(),
    status: "PENDING",
    structural_artifact_id: undefined,
    column_mapping: undefined,
    template_resolution: undefined,
    ml_insights: undefined,
    stats: undefined,
    errors_ref: undefined,
    created_at: now,
    updated_at: now,
    ...partial,
  };

  inMemoryJobs[job._id] = job;
  return job;
}

export async function findJobById(id: string) {
  return inMemoryJobs[id];
}

export async function updateJobStatus(id: string, status: ImportJob["status"]) {
  const job = inMemoryJobs[id];
  if (!job) throw new Error("Job not found");
  job.status = status;
  job.updated_at = new Date().toISOString();
  inMemoryJobs[id] = job;
  return job;
}

export async function attachArtifact(id: string, artifactId: string) {
  const job = inMemoryJobs[id];
  if (!job) throw new Error("Job not found");
  job.structural_artifact_id = artifactId;
  job.updated_at = new Date().toISOString();
  inMemoryJobs[id] = job;
  return job;
}

export async function updateJobTemplateResolution(id: string, resolution: TemplateSuggestionResult) {
  const job = inMemoryJobs[id];
  if (!job) throw new Error("Job not found");
  job.template_resolution = {
    template_id: resolution.strongMatch?.template_id,
    template_version_id: resolution.strongMatch?.template_version_id,
    similarity: resolution.strongMatch?.score,
    proposed_new_template: resolution.proposeNewTemplate,
    rationale: resolution.rationale,
  };
  job.updated_at = new Date().toISOString();
  inMemoryJobs[id] = job;
  return job;
}

export async function storeInsights(
  id: string,
  insights: NonNullable<ImportJob["ml_insights"]>,
  stats?: ImportJob["stats"]
) {
  const job = inMemoryJobs[id];
  if (!job) throw new Error("Job not found");
  job.ml_insights = insights;
  if (stats) job.stats = stats;
  job.updated_at = new Date().toISOString();
  inMemoryJobs[id] = job;
  return job;
}

export async function storeErrorFile(id: string, storageKey: string) {
  const job = inMemoryJobs[id];
  if (!job) throw new Error("Job not found");
  job.errors_ref = storageKey;
  job.updated_at = new Date().toISOString();
  inMemoryJobs[id] = job;
  return job;
}
