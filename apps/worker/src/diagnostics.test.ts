import { describe, expect, it } from "vitest";
import { analyzePotentialIssues } from "./diagnostics";
import { ImportJob } from "@shared/types";

function buildJob(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    _id: "job-1",
    project_id: "project-1",
    created_by: "user-1",
    mode: "POST_SERVICE",
    status: "AWAITING_TEMPLATE_CONFIRMATION",
    upload: {
      filename: "tickets.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 1024,
      storageKey: "storage-key",
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("analyzePotentialIssues", () => {
  it("marks the job as not ready when template confirmation is missing", () => {
    const job = buildJob();

    const result = analyzePotentialIssues(job);

    expect(result.ready_to_run).toBe(false);
    expect(result.issues.some((issue) => issue.code === "template-not-confirmed")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "ml-insights-missing")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "missing-structure")).toBe(true);
  });

  it("detects high-risk missingness profiles and blocks execution", () => {
    const job = buildJob({
      structural_artifact_id: "artifact-1",
      template_resolution: { template_version_id: "v1" },
      ml_insights: {
        missingness_profile: {
          signal: "MNAR",
          confidence: 0.92,
          imputation_permitted: false,
        },
      },
    });

    const result = analyzePotentialIssues(job);

    expect(result.ready_to_run).toBe(false);
    expect(result.issues.find((issue) => issue.code === "missingness-mnar")?.level).toBe("error");
  });

  it("allows execution when the job is fully prepared", () => {
    const job = buildJob({
      structural_artifact_id: "artifact-1",
      template_resolution: { template_version_id: "v1" },
      ml_insights: {
        missingness_profile: {
          signal: "MCAR",
          confidence: 0.61,
          imputation_permitted: true,
        },
      },
    });

    const result = analyzePotentialIssues(job);

    expect(result.ready_to_run).toBe(true);
    expect(result.issues.every((issue) => issue.level !== "error")).toBe(true);
  });
});
