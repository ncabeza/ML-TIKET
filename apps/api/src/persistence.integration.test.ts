import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { persistJob, updateJobStatus, storeInsights, findJobById } from "./persistence";
import { disconnectMongo, getImportJobsCollection } from "./db";

const baseUpload = {
  filename: "sample.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  size: 10,
  storageKey: "test-key",
};

describe("persistence with mongodb", () => {
  let mongo: MongoMemoryServer | null = null;
  let mongoAvailable = true;

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
      console.warn("Skipping Mongo-backed persistence tests:", error);
    }
  }, 30000);

  afterAll(async () => {
    await disconnectMongo();
    if (mongo) {
      await mongo.stop();
    }
  }, 30000);

  beforeEach(async () => {
    if (!mongoAvailable || !mongo) return;
    const collection = await getImportJobsCollection();
    await collection.deleteMany({});
  });

  it("persists and retrieves a job", async () => {
    if (!mongoAvailable || !mongo) return;
    const job = await persistJob({
      project_id: "project-1",
      created_by: "user-1",
      mode: "POST_SERVICE",
      upload: baseUpload,
    });

    const stored = await findJobById(job._id);
    expect(stored?._id).toBe(job._id);
    expect(stored?.status).toBe("PENDING");
  });

  it("updates job status", async () => {
    if (!mongoAvailable || !mongo) return;
    const job = await persistJob({
      project_id: "project-2",
      created_by: "user-2",
      mode: "POST_SERVICE",
      upload: baseUpload,
    });

    const updated = await updateJobStatus(job._id, "RUNNING");
    expect(updated.status).toBe("RUNNING");
    const stored = await findJobById(job._id);
    expect(stored?.status).toBe("RUNNING");
    expect(stored?.updated_at).not.toBe(job.updated_at);
  });

  it("stores insights and stats", async () => {
    if (!mongoAvailable || !mongo) return;
    const job = await persistJob({
      project_id: "project-3",
      created_by: "user-3",
      mode: "POST_SERVICE",
      upload: baseUpload,
    });

    await storeInsights(
      job._id,
      { structure_confidence: 0.9 },
      { detected_rows: 5, detected_tables: 1, columns: 3, estimated_tickets: 4 }
    );

    const stored = await findJobById(job._id);
    expect(stored?.ml_insights?.structure_confidence).toBe(0.9);
    expect(stored?.stats?.detected_rows).toBe(5);
  });
});
