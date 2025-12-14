import request from "supertest";
import { describe, expect, it, beforeEach } from "vitest";
import { createServer } from "../src/server";
import { resetPersistence } from "../src/persistence";
import { TemplateSuggestionResult } from "@shared/types";

const basePayload = {
  project_id: "proj-1",
  created_by: "tester@example.com",
  mode: "POST_SERVICE" as const,
  upload: {
    filename: "tickets.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 100,
    storageKey: "uploads/tickets.xlsx",
  },
};

const templateDecision: TemplateSuggestionResult = {
  strongMatch: {
    template_id: "tmpl-1",
    template_version_id: "v1",
    score: 0.9,
  },
  suggestions: [],
  proposeNewTemplate: false,
  rationale: "Coincide con la plantilla estándar",
  technicianSummary: "Asignación automática",
};

describe("import routes", () => {
  const app = createServer();

  beforeEach(() => {
    resetPersistence();
  });

  it("creates a job with validation", async () => {
    const res = await request(app).post("/api/import/jobs").send(basePayload);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      project_id: basePayload.project_id,
      mode: basePayload.mode,
      upload: basePayload.upload,
    });
  });

  it("rejects invalid create payloads", async () => {
    const res = await request(app)
      .post("/api/import/jobs")
      .send({ ...basePayload, upload: undefined });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid payload");
  });

  it("orchestrates preview and updates job state", async () => {
    const { body: created } = await request(app).post("/api/import/jobs").send(basePayload);
    const preview = await request(app).post(`/api/import/jobs/${created._id}/preview`).send();

    expect(preview.status).toBe(200);
    expect(preview.body).toHaveProperty("artifact");
    expect(preview.body).toHaveProperty("classifications");

    const updated = await request(app).get(`/api/import/jobs/${created._id}`);
    expect(updated.body.status).toBe("PREVIEW_READY");
    expect(updated.body.structural_artifact_id).toBeDefined();
  });

  it("confirms template and runs the job", async () => {
    const { body: created } = await request(app).post("/api/import/jobs").send(basePayload);
    await request(app).post(`/api/import/jobs/${created._id}/preview`).send();

    const confirmed = await request(app)
      .post(`/api/import/jobs/${created._id}/confirm-template`)
      .send(templateDecision);

    expect(confirmed.status).toBe(200);

    const run = await request(app).post(`/api/import/jobs/${created._id}/run`).send();
    expect(run.status).toBe(200);
    expect(run.body).toHaveProperty("created");

    const finalState = await request(app).get(`/api/import/jobs/${created._id}`);
    expect(finalState.body.status).toBe("COMPLETED");
    expect(finalState.body.template_resolution).toMatchObject({
      template_id: templateDecision.strongMatch?.template_id,
      template_version_id: templateDecision.strongMatch?.template_version_id,
    });
  });

  it("returns 404 for unknown jobs", async () => {
    const res = await request(app).get("/api/import/jobs/unknown-id");
    expect(res.status).toBe(404);
  });
});
