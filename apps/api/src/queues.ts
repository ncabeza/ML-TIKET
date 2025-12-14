import { ImportJob } from "@shared/types";
import { attachArtifact, storeInsights } from "./persistence";
import { requestNormalize, requestPreview } from "./pythonWorkerClient";

export async function queuePreviewJob(job: ImportJob) {
  const result = await requestPreview(job);

  if (result.structural_artifact_id) {
    await attachArtifact(job._id, result.structural_artifact_id);
  }

  if (result.ml_insights) {
    await storeInsights(job._id, result.ml_insights);
  }

  return { job, ...result };
}

export async function queueRunJob(job: ImportJob, sheet?: string) {
  const result = await requestNormalize(job, sheet);

  await storeInsights(job._id, {
    normalized_preview: result.sheets,
    normalization_metadata: result.metadata,
  });

  return result;
}
