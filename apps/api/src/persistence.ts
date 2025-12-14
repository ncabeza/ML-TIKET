import crypto from "crypto";
import { ImportJob, TemplateSuggestionResult } from "@shared/types";
import { getImportJobsCollection } from "./db";

const inMemoryJobs: Record<string, ImportJob> = {};

function useMemoryStore() {
  return !process.env.MONGODB_URI;
}

function buildInsertDefaults(id: string): ImportJob {
  const now = new Date().toISOString();
  return {
    _id: id,
    project_id: "",
    created_by: "",
    mode: "POST_SERVICE",
    status: "PENDING",
    upload: { filename: "", mimeType: "", size: 0, storageKey: "" },
    created_at: now,
    updated_at: now,
  } satisfies ImportJob;
}

export async function resetJobs() {
  if (useMemoryStore()) {
    Object.keys(inMemoryJobs).forEach((key) => delete inMemoryJobs[key]);
    return;
  }

  const collection = await getImportJobsCollection();
  await collection.deleteMany({});
}

export async function persistJob(
  partial: Pick<ImportJob, "project_id" | "created_by" | "mode" | "upload">
): Promise<ImportJob> {
  const now = new Date().toISOString();
  const job: ImportJob = {
    _id: crypto.randomUUID(),
    status: "PENDING",
    structural_artifact_id: undefined,
    column_mapping: undefined,
    template_resolution: undefined,
    ml_insights: undefined,
    stats: undefined,
    errors_ref: undefined,
    created_at: now,
    updated_at: now,
    ...partial,
  };

  if (useMemoryStore()) {
    inMemoryJobs[job._id] = job;
    return job;
  }

  const collection = await getImportJobsCollection();
  await collection.insertOne(job);
  return job;
}

export async function findJobById(id: string) {
  if (useMemoryStore()) {
    return inMemoryJobs[id] ?? null;
  }

  const collection = await getImportJobsCollection();
  return collection.findOne({ _id: id });
}

export async function updateJobStatus(id: string, status: ImportJob["status"]) {
  if (useMemoryStore()) {
    const job = inMemoryJobs[id];
    if (!job) throw new Error("Job not found");
    inMemoryJobs[id] = { ...job, status, updated_at: new Date().toISOString() };
    return inMemoryJobs[id];
  }

  const collection = await getImportJobsCollection();
  const now = new Date().toISOString();
  const result = await collection.findOneAndUpdate(
    { _id: id },
    { $set: { status, updated_at: now } },
    { returnDocument: "after" }
  );
  if (!result.value) throw new Error("Job not found");
  return result.value;
}

export async function attachArtifact(id: string, artifactId: string) {
  if (useMemoryStore()) {
    const job = inMemoryJobs[id];
    if (!job) throw new Error("Job not found");
    inMemoryJobs[id] = {
      ...job,
      structural_artifact_id: artifactId,
      updated_at: new Date().toISOString(),
    };
    return inMemoryJobs[id];
  }

  const collection = await getImportJobsCollection();
  const now = new Date().toISOString();
  const result = await collection.findOneAndUpdate(
    { _id: id },
    { $set: { structural_artifact_id: artifactId, updated_at: now } },
    { returnDocument: "after" }
  );
  if (!result.value) throw new Error("Job not found");
  return result.value;
}

export async function updateJobTemplateResolution(id: string, resolution: TemplateSuggestionResult) {
  if (useMemoryStore()) {
    const now = new Date().toISOString();
    const existing = inMemoryJobs[id] ?? buildInsertDefaults(id);
    const updated: ImportJob = {
      ...existing,
      template_resolution: {
        template_id: resolution.strongMatch?.template_id,
        template_version_id: resolution.strongMatch?.template_version_id,
        similarity: resolution.strongMatch?.score,
        proposed_new_template: resolution.proposeNewTemplate,
        rationale: resolution.rationale,
      },
      updated_at: now,
    };

    inMemoryJobs[id] = updated;
    return updated;
  }

  const collection = await getImportJobsCollection();
  const now = new Date().toISOString();
  const insertDefaults: Partial<ImportJob> = {
    _id: id,
    project_id: "",
    created_by: "",
    mode: "POST_SERVICE",
    status: "PENDING",
    upload: { filename: "", mimeType: "", size: 0, storageKey: "" },
    created_at: now,
  };
  const update = {
    template_resolution: {
      template_id: resolution.strongMatch?.template_id,
      template_version_id: resolution.strongMatch?.template_version_id,
      similarity: resolution.strongMatch?.score,
      proposed_new_template: resolution.proposeNewTemplate,
      rationale: resolution.rationale,
    },
    updated_at: now,
  } satisfies Partial<ImportJob>;

  const result = await collection.findOneAndUpdate(
    { _id: id },
    { $set: update, $setOnInsert: insertDefaults },
    { returnDocument: "after", upsert: true }
  );
  if (!result.value) throw new Error("Job not found");
  return result.value;
}

export async function storeInsights(
  id: string,
  insights: NonNullable<ImportJob["ml_insights"]>,
  stats?: ImportJob["stats"]
) {
  if (useMemoryStore()) {
    const now = new Date().toISOString();
    const existing = inMemoryJobs[id] ?? buildInsertDefaults(id);
    const updated: ImportJob = {
      ...existing,
      ml_insights: insights,
      ...(stats ? { stats } : {}),
      updated_at: now,
    };

    inMemoryJobs[id] = updated;
    return updated;
  }

  const collection = await getImportJobsCollection();
  const now = new Date().toISOString();
  const insertDefaults: Partial<ImportJob> = {
    _id: id,
    project_id: "",
    created_by: "",
    mode: "POST_SERVICE",
    status: "PENDING",
    upload: { filename: "", mimeType: "", size: 0, storageKey: "" },
    created_at: now,
  };
  const result = await collection.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        ml_insights: insights,
        ...(stats ? { stats } : {}),
        updated_at: now,
      },
      $setOnInsert: insertDefaults,
    },
    { returnDocument: "after", upsert: true }
  );
  if (!result.value) throw new Error("Job not found");
  return result.value;
}

export async function storeErrorFile(id: string, storageKey: string) {
  if (useMemoryStore()) {
    const now = new Date().toISOString();
    const existing = inMemoryJobs[id] ?? buildInsertDefaults(id);
    const updated: ImportJob = {
      ...existing,
      errors_ref: storageKey,
      updated_at: now,
    };
    inMemoryJobs[id] = updated;
    return updated;
  }

  const collection = await getImportJobsCollection();
  const now = new Date().toISOString();
  const insertDefaults: Partial<ImportJob> = {
    _id: id,
    project_id: "",
    created_by: "",
    mode: "POST_SERVICE",
    status: "PENDING",
    upload: { filename: "", mimeType: "", size: 0, storageKey: "" },
    created_at: now,
  };
  const result = await collection.findOneAndUpdate(
    { _id: id },
    { $set: { errors_ref: storageKey, updated_at: now }, $setOnInsert: insertDefaults },
    { returnDocument: "after", upsert: true }
  );
  if (!result.value) throw new Error("Job not found");
  return result.value;
}
