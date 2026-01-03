import { ImportJob } from "@shared/types";
import { scheduleAssignments } from "./assignment";

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
  const ticketsToCreate = 10;
  const tickets = Array.from({ length: ticketsToCreate }, (_, index) => `${job._id}-ticket-${index + 1}`);

  scheduleAssignments(job, tickets);

  return {
    created: ticketsToCreate,
    skipped: 0,
    template_version_id: job.template_resolution?.template_version_id,
    assignments_queued: ticketsToCreate,
  };
}
