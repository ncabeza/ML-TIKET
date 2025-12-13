import { ImportJob, ImportMode, PreviewPayload, TemplateSuggestionResult } from "@shared/types";
import { orchestratePreview, orchestrateRun, proposeTemplateDecision } from "./orchestration";
import { persistJob, findJobById } from "./persistence";

// The following handlers are written as Vercel-style serverless functions.
// They focus on deterministic Mongo-backed orchestration; ML only provides hints.

export async function postImportJob(payload: {
  project_id: string;
  created_by: string;
  mode: ImportMode;
  upload: { filename: string; mimeType: string; size: number; storageKey: string };
}): Promise<ImportJob> {
  const job = await persistJob({
    project_id: payload.project_id,
    created_by: payload.created_by,
    mode: payload.mode,
    upload: payload.upload,
  });

  return job;
}

export async function previewImport(jobId: string): Promise<PreviewPayload> {
  const job = await findJobById(jobId);
  if (!job) {
    throw new Error("Job not found");
  }

  // ML runs only in the preview phase; downstream mutations are prohibited here.
  return orchestratePreview(job);
}

export async function confirmTemplate(jobId: string, templateDecision: TemplateSuggestionResult) {
  const job = await findJobById(jobId);
  if (!job) {
    throw new Error("Job not found");
  }

  // Confirmation must come from the user; no automatic creation or promotion.
  return proposeTemplateDecision(job, templateDecision);
}

export async function runImport(jobId: string) {
  const job = await findJobById(jobId);
  if (!job) {
    throw new Error("Job not found");
  }

  return orchestrateRun(job);
}

export async function getImportJob(jobId: string) {
  return findJobById(jobId);
}

export async function getErrors(jobId: string) {
  // Returns a pointer to the generated Excel with row-level blocking reasons.
  const job = await findJobById(jobId);
  if (!job) throw new Error("Job not found");
  return job.errors_ref;
}
