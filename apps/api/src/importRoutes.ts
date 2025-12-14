import { Router, Request, Response } from "express";
import { z, ZodError } from "zod";
import { ImportJob, ImportMode, PreviewPayload, TemplateSuggestionResult } from "@shared/types";
import {
  analyzeJobDiagnostics,
  orchestratePreview,
  orchestrateRun,
  proposeTemplateDecision,
} from "./orchestration";
import { persistJob, findJobById } from "./persistence";

// The following handlers are written as Vercel-style serverless functions.
// They focus on deterministic Mongo-backed orchestration; ML only provides hints.

export async function postImportJob(payload: {
  project_id: string;
  created_by: string;
  mode: ImportMode;
  upload: { filename: string; mimeType: string; size: number; storageKey: string };
}): Promise<ImportJob> {
  const job = await persistJob({
    project_id: payload.project_id,
    created_by: payload.created_by,
    mode: payload.mode,
    upload: payload.upload,
  });

  return job;
}

export async function previewImport(jobId: string): Promise<PreviewPayload> {
  const job = await findJobById(jobId);
  if (!job) {
    throw new Error("Job not found");
  }

  // ML runs only in the preview phase; downstream mutations are prohibited here.
  return orchestratePreview(job);
}

export async function confirmTemplate(jobId: string, templateDecision: TemplateSuggestionResult) {
  const job = await findJobById(jobId);
  if (!job) {
    throw new Error("Job not found");
  }

  // Confirmation must come from the user; no automatic creation or promotion.
  return proposeTemplateDecision(job, templateDecision);
}

export async function runImport(jobId: string) {
  const job = await findJobById(jobId);
  if (!job) {
    throw new Error("Job not found");
  }

  return orchestrateRun(job);
}

export async function getImportJob(jobId: string) {
  return findJobById(jobId);
}

export async function getErrors(jobId: string) {
  // Returns a pointer to the generated Excel with row-level blocking reasons.
  const job = await findJobById(jobId);
  if (!job) throw new Error("Job not found");
  return job.errors_ref;
}

export async function analyzePossibleErrors(jobId: string) {
  const job = await findJobById(jobId);
  if (!job) {
    throw new Error("Job not found");
  }

  return analyzeJobDiagnostics(job);
}

const uploadSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().positive(),
  storageKey: z.string().min(1),
});

const createJobSchema = z.object({
  project_id: z.string().min(1),
  created_by: z.string().min(1),
  mode: z.enum(["POST_SERVICE", "MASS_CREATE"]),
  upload: uploadSchema,
});

const templateMatchSchema = z.object({
  template_id: z.string().min(1),
  template_version_id: z.string().min(1),
  score: z.number(),
});

const repeatUploadHintSchema = z.object({
  fingerprint: z.string().min(1),
  confirmedDateColumns: z.array(z.string()),
  requiredPrompts: z.array(z.string()),
  templateExistsOnPlatform: z.boolean(),
  note: z.string(),
});

const templateDecisionSchema = z.object({
  strongMatch: templateMatchSchema.optional(),
  suggestions: z.array(templateMatchSchema).default([]),
  proposeNewTemplate: z.boolean(),
  rationale: z.string().min(1),
  repeatUploadHint: repeatUploadHintSchema.optional(),
  technicianSummary: z.string().min(1),
  nextSteps: z.array(z.string()).optional(),
});

function errorResponse(res: Response, status: number, message: string, details?: string[]) {
  return res.status(status).json({ error: message, details });
}

function normalizeError(error: unknown) {
  if (error instanceof ZodError) {
    return { status: 400, message: "Invalid payload", details: error.issues.map((i) => i.message) };
  }

  if (error instanceof Error) {
    if (error.message === "Job not found") {
      return { status: 404, message: error.message };
    }

    if (error.message.includes("Ambiguous decision")) {
      return { status: 400, message: error.message };
    }

    return { status: 500, message: "Internal server error" };
  }

  return { status: 500, message: "Internal server error" };
}

async function withErrorHandling<T>(res: Response, fn: () => Promise<T>) {
  try {
    const result = await fn();
    return res.json(result);
  } catch (error) {
    const normalized = normalizeError(error);
    if (normalized.status >= 500) {
      console.error(error);
    }
    return errorResponse(res, normalized.status, normalized.message, normalized.details);
  }
}

export function createImportRouter() {
  const router = Router();

  router.post("/jobs", async (req: Request, res: Response) => {
    const parseResult = createJobSchema.safeParse(req.body);
    if (!parseResult.success) {
      return errorResponse(
        res,
        400,
        "Invalid payload",
        parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
      );
    }

    return withErrorHandling(res, async () => {
      const job = await postImportJob(parseResult.data);
      res.status(201);
      return job;
    });
  });

  router.get("/jobs/:id", async (req: Request, res: Response) => {
    return withErrorHandling(res, async () => {
      const job = await getImportJob(req.params.id);
      if (!job) {
        throw new Error("Job not found");
      }
      return job;
    });
  });

  router.post("/jobs/:id/preview", async (req: Request, res: Response) => {
    return withErrorHandling(res, async () => previewImport(req.params.id));
  });

  router.post("/jobs/:id/confirm-template", async (req: Request, res: Response) => {
    const parseResult = templateDecisionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return errorResponse(
        res,
        400,
        "Invalid payload",
        parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
      );
    }

    return withErrorHandling(res, async () => confirmTemplate(req.params.id, parseResult.data));
  });

  router.post("/jobs/:id/run", async (req: Request, res: Response) => {
    return withErrorHandling(res, async () => runImport(req.params.id));
  });

  return router;
}
