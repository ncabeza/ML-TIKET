import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import nock from "nock";
import { describe, expect, it, beforeEach, afterEach, vi, beforeAll, afterAll } from "vitest";
import { queuePreviewJob, queueRunJob } from "./queues";
import { findJobById, persistJob } from "./persistence";
import { MongoMemoryServer } from "mongodb-memory-server";
import { disconnectMongo, getImportJobsCollection } from "./db";

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
  let mongo: MongoMemoryServer | null = null;
  let mongoAvailable = true;
  const previousWorkerUrl = process.env.PYTHON_WORKER_URL;

  beforeAll(async () => {
    delete process.env.http_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTPS_PROXY;

    try {
      mongo = await MongoMemoryServer.create();
      process.env.MONGODB_URI = mongo.getUri();
      await disconnectMongo();
    } catch (error) {
      mongoAvailable = false;
      console.warn("Skipping queue persistence tests:", error);
    }
  }, 30000);

  afterAll(async () => {
    await disconnectMongo();
    if (mongo) {
      await mongo.stop();
    }
  }, 30000);

  beforeEach(async () => {
    nock.cleanAll();
    process.env.PYTHON_WORKER_URL = "http://worker.test";
    if (!mongoAvailable || !mongo) return;
    const collection = await getImportJobsCollection();
    await collection.deleteMany({});
  });

  afterEach(() => {
    process.env.PYTHON_WORKER_URL = previousWorkerUrl;
    nock.cleanAll();
  });

  it("stores artifacts and insights from preview", async () => {
    if (!mongoAvailable || !mongo) return;
    const job = await createJob();

    nock("http://worker.test")
      .post("/preview")
      .reply(200, { structural_artifact_id: "art-123", ml_insights: { structure_confidence: 0.92 } });

    const response = await queuePreviewJob(job);
    expect(response.artifact._id).toBe("art-123");
    expect(response.posDetection.missing_required).toBe(true);
    expect(response.geolocation.ok).toBe(false);
    expect(response.ticketTitleHint.template).toContain("Ticket sin POS");

    const stored = await findJobById(job._id);
    expect(stored?.structural_artifact_id).toBe("art-123");
    expect(stored?.ml_insights?.structure_confidence).toBe(0.92);
  });

  it("retries normalize on transient error and stores normalized preview", async () => {
    if (!mongoAvailable || !mongo) return;
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
    const sheetRows = response.sheets.Sheet1 as Array<{ A: string }>;
    expect(sheetRows[0].A).toBe("1");

    const stored = await findJobById(job._id);
    expect(stored?.ml_insights?.normalized_preview?.Sheet1).toHaveLength(1);
    expect(stored?.ml_insights?.normalization_metadata?.Sheet1?.total_rows).toBe(1);
  });

  it("logs structured error when worker request fails", async () => {
    if (!mongoAvailable || !mongo) return;
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
