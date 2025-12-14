import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import nock from "nock";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { queuePreviewJob, queueRunJob } from "./queues";
import { findJobById, persistJob } from "./persistence";

const baseUpload = {
  filename: "sample.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  size: 10,
  storageKey: "",
};

async function createJob() {
  const filePath = path.join(os.tmpdir(), `preview-${Date.now()}.xlsx`);
  await fs.writeFile(filePath, "dummy-excel-bytes");
  return persistJob({
    project_id: "project-1",
    created_by: "user-1",
    mode: "POST_SERVICE",
    upload: { ...baseUpload, storageKey: filePath },
  });
}

describe("python worker queues", () => {
  const previousWorkerUrl = process.env.PYTHON_WORKER_URL;

  beforeEach(() => {
    nock.cleanAll();
    process.env.PYTHON_WORKER_URL = "http://worker.test";
  });

  afterEach(() => {
    process.env.PYTHON_WORKER_URL = previousWorkerUrl;
    nock.cleanAll();
  });

  it("stores artifacts and insights from preview", async () => {
    const job = await createJob();

    nock("http://worker.test")
      .post("/preview")
      .reply(200, { structural_artifact_id: "art-123", ml_insights: { structure_confidence: 0.92 } });

    const response = await queuePreviewJob(job);
    expect(response.structural_artifact_id).toBe("art-123");

    const stored = await findJobById(job._id);
    expect(stored?.structural_artifact_id).toBe("art-123");
    expect(stored?.ml_insights?.structure_confidence).toBe(0.92);
  });

  it("retries normalize on transient error and stores normalized preview", async () => {
    const job = await createJob();

    nock("http://worker.test")
      .post("/normalize")
      .reply(500, { detail: "temporary failure" })
      .post("/normalize")
      .reply(200, {
        sheets: { Sheet1: [{ A: "1" }] },
        metadata: { Sheet1: { total_rows: 1, truncated: false } },
      });

    const response = await queueRunJob(job);
    expect(response.sheets.Sheet1[0].A).toBe("1");

    const stored = await findJobById(job._id);
    expect(stored?.ml_insights?.normalized_preview?.Sheet1).toHaveLength(1);
    expect(stored?.ml_insights?.normalization_metadata?.Sheet1?.total_rows).toBe(1);
  });

  it("logs structured error when worker request fails", async () => {
    const job = await createJob();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const previousRetries = process.env.PYTHON_WORKER_RETRIES;
    process.env.PYTHON_WORKER_RETRIES = "0";

    nock("http://worker.test").post("/preview").reply(500, { detail: "boom" });

    await expect(queuePreviewJob(job)).rejects.toThrow(/Preview request failed/);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("python_worker_request_failed")
    );

    errorSpy.mockRestore();
    process.env.PYTHON_WORKER_RETRIES = previousRetries;
  });
});
