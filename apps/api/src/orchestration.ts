import { PreviewPayload, ImportJob, TemplateSuggestionResult } from "@shared/types";
import { queuePreviewJob, queueRunJob } from "./queues";
import { updateJobStatus, updateJobTemplateResolution } from "./persistence";

export async function orchestratePreview(job: ImportJob): Promise<PreviewPayload> {
  // Kick work to a dedicated worker to avoid Vercel timeouts.
  const previewResult = await queuePreviewJob(job);
  await updateJobStatus(job._id, "PREVIEW_READY");
  return previewResult;
}

export async function proposeTemplateDecision(
  job: ImportJob,
  decision: TemplateSuggestionResult
) {
  if (decision.proposeNewTemplate && decision.strongMatch) {
    throw new Error("Ambiguous decision: cannot propose new template and confirm a match simultaneously");
  }

  await updateJobTemplateResolution(job._id, decision);
  await updateJobStatus(job._id, "READY_TO_RUN");
  return decision;
}

export async function orchestrateRun(job: ImportJob) {
  await updateJobStatus(job._id, "RUNNING");
  return queueRunJob(job);
}
