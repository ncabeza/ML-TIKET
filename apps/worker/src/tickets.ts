import { ImportJob } from "@shared/types";

export async function validateHardRules(job: ImportJob): Promise<{ ok: boolean; errorFileKey?: string }> {
  if (!job.template_resolution?.template_version_id) {
    return { ok: false, errorFileKey: "errors/missing-template.xlsx" };
  }

  if (job.mode === "MASS_CREATE" && job.ml_insights?.missingness_profile?.signal === "MNAR") {
    return { ok: false, errorFileKey: "errors/mnar-blocked.xlsx" };
  }

  if (!job.ml_insights?.pos_detection || job.ml_insights.pos_detection.missing_required) {
    return { ok: false, errorFileKey: "errors/missing-pos.xlsx" };
  }

  if (job.ml_insights?.geolocation_validation && !job.ml_insights.geolocation_validation.ok) {
    return { ok: false, errorFileKey: "errors/geolocation-blocked.xlsx" };
  }

  return { ok: true };
}

export async function createTicketsInBatches(job: ImportJob) {
  // Idempotency via row_hash would be implemented here.
  return {
    created: 10,
    skipped: 0,
    template_version_id: job.template_resolution?.template_version_id,
  };
}
