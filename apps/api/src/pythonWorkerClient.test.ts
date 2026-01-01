import fs from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { ImportJob } from "@shared/types";
import {
  PythonWorkerRequestError,
  requestPreview,
  resolveWorkerConfig,
} from "./pythonWorkerClient";

const baseJob: ImportJob = {
  _id: "job-1",
  project_id: "project-1",
  created_by: "user-1",
  mode: "POST_SERVICE",
  status: "PENDING",
  upload: {
    filename: "upload.xlsx",
    mimeType: "application/vnd.ms-excel",
    size: 10,
    storageKey: "./does/not/exist.xlsx",
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("resolveWorkerConfig", () => {
  it("falls back to defaults for empty or invalid env values", () => {
    const config = resolveWorkerConfig({
      PYTHON_WORKER_URL: "  ",
      PYTHON_WORKER_TIMEOUT_MS: "-5",
      PYTHON_WORKER_RETRIES: "not-a-number",
    });

    expect(config.url).toBe("http://localhost:8000");
    expect(config.timeoutMs).toBe(15_000);
    expect(config.retries).toBe(2);
  });

  it("parses overrides when they are valid", () => {
    const config = resolveWorkerConfig({
      PYTHON_WORKER_URL: "http://worker:9999",
      PYTHON_WORKER_TIMEOUT_MS: "2000",
      PYTHON_WORKER_RETRIES: "4",
    });

    expect(config.url).toBe("http://worker:9999");
    expect(config.timeoutMs).toBe(2000);
    expect(config.retries).toBe(4);
  });
});

describe("requestPreview", () => {
  it("fails fast when the upload file is missing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const accessSpy = vi.spyOn(fs, "access");

    await expect(requestPreview(baseJob)).rejects.toBeInstanceOf(PythonWorkerRequestError);

    expect(accessSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    accessSpy.mockRestore();
  });
});
