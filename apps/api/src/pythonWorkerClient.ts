import fs from "node:fs/promises";
import { ImportJob, MLInsights } from "@shared/types";

const DEFAULT_WORKER_URL = "http://localhost:8000";
const DEFAULT_WORKER_TIMEOUT_MS = 15_000;
const DEFAULT_WORKER_RETRIES = 2;

interface PythonWorkerPreviewResponse {
  structural_artifact_id?: string;
  ml_insights?: MLInsights;
  navigation?: Record<string, unknown> | null;
  sheets?: Array<Record<string, unknown>>;
}

interface PythonWorkerNormalizeResponse {
  sheets: Record<string, unknown[]>;
  metadata?: Record<string, { total_rows: number; truncated: boolean }>;
  navigation?: Record<string, unknown> | null;
}

class PythonWorkerRequestError extends Error {
  retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.retryable = retryable;
  }
}

function getWorkerUrl() {
  return process.env.PYTHON_WORKER_URL || DEFAULT_WORKER_URL;
}

function getTimeoutMs() {
  return Number(process.env.PYTHON_WORKER_TIMEOUT_MS || DEFAULT_WORKER_TIMEOUT_MS);
}

function getRetryCount() {
  return Number(process.env.PYTHON_WORKER_RETRIES || DEFAULT_WORKER_RETRIES);
}

async function requestWithRetry<T>(fn: () => Promise<T>, endpoint: string, attempt = 0): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const retryable =
      (error instanceof PythonWorkerRequestError && error.retryable) ||
      (error instanceof Error && ("code" in error || error.name === "AbortError"));
    if (attempt < getRetryCount() && retryable) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      return requestWithRetry(fn, endpoint, attempt + 1);
    }

    console.error(
      JSON.stringify({
        event: "python_worker_request_failed",
        endpoint,
        attempt,
        message: error instanceof Error ? error.message : String(error),
      })
    );
    throw error;
  }
}

async function postMultipart(
  endpoint: string,
  job: ImportJob,
  sheet?: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  const buffer = await fs.readFile(job.upload.storageKey);
  const form = new FormData();
  const blob = new Blob([buffer]);
  form.append("file", blob, job.upload.filename);

  const url = new URL(endpoint, getWorkerUrl());
  if (sheet) url.searchParams.set("sheet", sheet);

  try {
    return await fetch(url, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestPreview(job: ImportJob, sheet?: string): Promise<PythonWorkerPreviewResponse> {
  return requestWithRetry(async () => {
    const response = await postMultipart("/preview", job, sheet);
    if (!response.ok) {
      const body = await response.text();
      throw new PythonWorkerRequestError(
        `Preview request failed with status ${response.status}: ${body}`,
        response.status >= 500
      );
    }
    return (await response.json()) as PythonWorkerPreviewResponse;
  }, "/preview");
}

export async function requestNormalize(job: ImportJob, sheet?: string): Promise<PythonWorkerNormalizeResponse> {
  return requestWithRetry(async () => {
    const response = await postMultipart("/normalize", job, sheet);
    if (!response.ok) {
      const body = await response.text();
      throw new PythonWorkerRequestError(
        `Normalize request failed with status ${response.status}: ${body}`,
        response.status >= 500
      );
    }
    return (await response.json()) as PythonWorkerNormalizeResponse;
  }, "/normalize");
}
