import request from "supertest";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createServer } from "./server";
import * as orchestration from "./orchestration";
import { resetJobs } from "./persistence";
import { TemplateSuggestionResult, PreviewPayload } from "@shared/types";

const app = createServer();

const basePayload = {
  project_id: "project-1",
  created_by: "user-1",
  mode: "POST_SERVICE" as const,
  upload: {
    filename: "sample.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 123,
    storageKey: "storage-key",
  },
};

describe("import routes", () => {
  beforeEach(async () => {
    await resetJobs();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects invalid job creation payloads", async () => {
    const response = await request(app).post("/api/import/jobs").send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid payload");
  });

  it("creates and retrieves a job", async () => {
    const createResponse = await request(app).post("/api/import/jobs").send(basePayload);

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.project_id).toBe(basePayload.project_id);

    const fetchResponse = await request(app)
      .get(`/api/import/jobs/${createResponse.body._id}`)
      .send();

    expect(fetchResponse.status).toBe(200);
    expect(fetchResponse.body._id).toBe(createResponse.body._id);
  });

  it("returns 404 for missing jobs", async () => {
    const previewResponse = await request(app)
      .post("/api/import/jobs/missing-id/preview")
      .send();

    expect(previewResponse.status).toBe(404);
    expect(previewResponse.body.error).toBe("Job not found");
  });

  it("calls preview orchestration and returns payload", async () => {
    const created = await request(app).post("/api/import/jobs").send(basePayload);
    const previewPayload: PreviewPayload = {
      job: { ...created.body, status: "PREVIEW_READY" },
      artifact: {
        _id: "art-1",
        job_id: created.body._id,
        struct_tree: [],
        detected_tables: [],
        anchors: [],
        formula_index: [],
        format_groups: [],
        compressed_representation: { anchorHash: "", formulaFingerprint: "", formatClusters: {} },
      },
      classifications: [],
      templateSuggestion: {
        strongMatch: undefined,
        suggestions: [],
        proposeNewTemplate: true,
        rationale: "pending match",
        technicianSummary: "review",
      },
      missingness: { profile: { signal: "MAR", confidence: 0.5, imputation_permitted: false }, notes: [] },
      technicianAssignment: { matches: [], policy: "REVIEW", notes: [] },
    };

    const spy = vi
      .spyOn(orchestration, "orchestratePreview")
      .mockResolvedValue(previewPayload);

    const response = await request(app)
      .post(`/api/import/jobs/${created.body._id}/preview`)
      .send();

    expect(response.status).toBe(200);
    expect(response.body.artifact._id).toBe("art-1");
    expect(spy).toHaveBeenCalled();
  });

  it("validates confirm-template payloads and forwards the decision", async () => {
    const created = await request(app).post("/api/import/jobs").send(basePayload);

    const decision: TemplateSuggestionResult = {
      strongMatch: undefined,
      suggestions: [],
      proposeNewTemplate: false,
      rationale: "looks good",
      repeatUploadHint: undefined,
      technicianSummary: "same tech",
      nextSteps: ["confirm run"],
    };

    const spy = vi
      .spyOn(orchestration, "proposeTemplateDecision")
      .mockResolvedValue(decision);

    const response = await request(app)
      .post(`/api/import/jobs/${created.body._id}/confirm-template`)
      .send(decision);

    expect(response.status).toBe(200);
    expect(response.body.rationale).toBe("looks good");
    expect(spy).toHaveBeenCalled();
  });

  it("fails validation when decision is ambiguous", async () => {
    const created = await request(app).post("/api/import/jobs").send(basePayload);

    const response = await request(app)
      .post(`/api/import/jobs/${created.body._id}/confirm-template`)
      .send({
        strongMatch: { template_id: "t1", template_version_id: "v1", score: 0.9 },
        suggestions: [],
        proposeNewTemplate: true,
        rationale: "both?",
        technicianSummary: "summary",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid payload");
  });

  it("runs import for a job", async () => {
    const created = await request(app).post("/api/import/jobs").send(basePayload);
    const runResult = {
      sheets: { Sheet1: [{ A: "queued" }] },
      metadata: { Sheet1: { total_rows: 1, truncated: false } },
    };
    const spy = vi
      .spyOn(orchestration, "orchestrateRun")
      .mockResolvedValue(runResult as Awaited<ReturnType<typeof orchestration.orchestrateRun>>);

    const response = await request(app)
      .post(`/api/import/jobs/${created.body._id}/run`)
      .send();

    expect(response.status).toBe(200);
    expect(response.body.sheets.Sheet1[0].A).toBe("queued");
    expect(spy).toHaveBeenCalled();
  });
});
