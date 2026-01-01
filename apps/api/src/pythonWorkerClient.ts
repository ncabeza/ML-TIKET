import fs from "node:fs/promises";
import { ImportJob, MLInsights } from "@shared/types";

const DEFAULT_WORKER_URL = "http://localhost:8000";
const DEFAULT_WORKER_TIMEOUT_MS = 15_000;
const DEFAULT_WORKER_RETRIES = 2;
const MIN_TIMEOUT_MS = 500;

export interface PythonWorkerConfig {
  url: string;
  timeoutMs: number;
  retries: number;
}

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

export class PythonWorkerRequestError extends Error {
  retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.retryable = retryable;
  }
}

function parseNumberFromEnv(value: string | undefined, fallback: number, minimum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) return fallback;
  return parsed;
}

export function resolveWorkerConfig(env = process.env): PythonWorkerConfig {
  return {
    url: env.PYTHON_WORKER_URL?.trim() || DEFAULT_WORKER_URL,
    timeoutMs: parseNumberFromEnv(env.PYTHON_WORKER_TIMEOUT_MS, DEFAULT_WORKER_TIMEOUT_MS, MIN_TIMEOUT_MS),
    retries: Math.floor(parseNumberFromEnv(env.PYTHON_WORKER_RETRIES, DEFAULT_WORKER_RETRIES, 0)),
  };
}

async function requestWithRetry<T>(
  fn: () => Promise<T>,
  endpoint: string,
  config: PythonWorkerConfig,
  attempt = 0
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const retryable =
      (error instanceof PythonWorkerRequestError && error.retryable) ||
      (error instanceof Error && ("code" in error || error.name === "AbortError"));
    if (attempt < config.retries && retryable) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      return requestWithRetry(fn, endpoint, config, attempt + 1);
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
  config: PythonWorkerConfig,
  sheet?: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    await fs.access(job.upload.storageKey);
  } catch (error) {
    throw new PythonWorkerRequestError(
      `File not found for upload: ${job.upload.storageKey}`,
      false
    );
  }

  const buffer = await fs.readFile(job.upload.storageKey);
  const form = new FormData();
  const blob = new Blob([buffer]);
  form.append("file", blob, job.upload.filename);

  const url = new URL(endpoint, config.url);
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

export async function requestPreview(
  job: ImportJob,
  sheet?: string,
  config: PythonWorkerConfig = resolveWorkerConfig()
): Promise<PythonWorkerPreviewResponse> {
  return requestWithRetry(async () => {
    const response = await postMultipart("/preview", job, config, sheet);
    if (!response.ok) {
      const body = await response.text();
      throw new PythonWorkerRequestError(
        `Preview request failed with status ${response.status}: ${body}`,
        response.status >= 500
      );
    }
    return (await response.json()) as PythonWorkerPreviewResponse;
  }, "/preview", config);
}

export async function requestNormalize(
  job: ImportJob,
  sheet?: string,
  config: PythonWorkerConfig = resolveWorkerConfig()
): Promise<PythonWorkerNormalizeResponse> {
  return requestWithRetry(async () => {
    const response = await postMultipart("/normalize", job, config, sheet);
    if (!response.ok) {
      const body = await response.text();
      throw new PythonWorkerRequestError(
        `Normalize request failed with status ${response.status}: ${body}`,
        response.status >= 500
      );
    }
    return (await response.json()) as PythonWorkerNormalizeResponse;
  }, "/normalize", config);
}
