import { ImportJob, PreviewPayload } from "@shared/types";
import { buildPreviewPipeline, buildRunPipeline } from "../../worker/src/pipeline";

// These functions mimic durable queueing to a worker process.
export async function queuePreviewJob(job: ImportJob): Promise<PreviewPayload> {
  const pipeline = buildPreviewPipeline();
  return pipeline(job);
}

export async function queueRunJob(job: ImportJob) {
  const pipeline = buildRunPipeline();
  return pipeline(job);
}
