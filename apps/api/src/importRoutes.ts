import { Request, Response, Router } from "express";
import { z } from "zod";
import { ImportJob, ImportMode, PreviewPayload, TemplateSuggestionResult } from "@shared/types";
import {
  analyzeJobDiagnostics,
  orchestratePreview,
  orchestrateRun,
  proposeTemplateDecision,
} from "./orchestration";
import { persistJob, findJobById } from "./persistence";

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

const uploadSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().nonnegative(),
  storageKey: z.string().min(1),
});

const createJobSchema = z.object({
  project_id: z.string().min(1),
  created_by: z.string().min(1),
  mode: z.enum(["POST_SERVICE", "MASS_CREATE"] as const),
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

const templateDecisionSchema = z
  .object({
    strongMatch: templateMatchSchema.optional(),
    suggestions: z.array(templateMatchSchema).default([]),
    proposeNewTemplate: z.boolean(),
    rationale: z.string().min(1),
    repeatUploadHint: repeatUploadHintSchema.optional(),
    technicianSummary: z.string().min(1),
    nextSteps: z.array(z.string()).optional(),
  })
  .refine(
    (value) => !(value.proposeNewTemplate && value.strongMatch),
    {
      message:
        "Ambiguous decision: cannot propose new template and confirm a match simultaneously",
      path: ["proposeNewTemplate"],
    }
  );

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
    throw new NotFoundError("Job not found");
  }

  // ML runs only in the preview phase; downstream mutations are prohibited here.
  return orchestratePreview(job);
}

export async function confirmTemplate(jobId: string, templateDecision: TemplateSuggestionResult) {
  const job = await findJobById(jobId);
  if (!job) {
    throw new NotFoundError("Job not found");
  }

  // Confirmation must come from the user; no automatic creation or promotion.
  return proposeTemplateDecision(job, templateDecision);
}

export async function runImport(jobId: string) {
  const job = await findJobById(jobId);
  if (!job) {
    throw new NotFoundError("Job not found");
  }

  return orchestrateRun(job);
}

export async function getImportJob(jobId: string) {
  const job = await findJobById(jobId);
  if (!job) throw new NotFoundError("Job not found");
  return job;
}

export async function getErrors(jobId: string) {
  // Returns a pointer to the generated Excel with row-level blocking reasons.
  const job = await findJobById(jobId);
  if (!job) throw new NotFoundError("Job not found");
  return job.errors_ref;
}

export async function analyzePossibleErrors(jobId: string) {
  const job = await findJobById(jobId);
  if (!job) {
    throw new NotFoundError("Job not found");
  }

  return analyzeJobDiagnostics(job);
}

function mapErrorToResponse(error: unknown, res: Response) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Invalid payload", details: error.errors });
    return;
  }

  if (error instanceof NotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof Error && error.message.includes("Ambiguous decision")) {
    res.status(400).json({ error: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
}

function wrap(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await handler(req, res);
    } catch (error) {
      mapErrorToResponse(error, res);
    }
  };
}

export function createImportRouter() {
  const router = Router();

  router.post(
    "/api/import/jobs",
    wrap(async (req: Request, res: Response) => {
      const parsed = createJobSchema.parse(req.body);
      const job = await postImportJob(parsed);
      res.status(201).json(job);
    })
  );

  router.get(
    "/api/import/jobs/:id",
    wrap(async (req: Request, res: Response) => {
      const job = await getImportJob(req.params.id);
      res.status(200).json(job);
    })
  );

  router.post(
    "/api/import/jobs/:id/preview",
    wrap(async (req: Request, res: Response) => {
      const preview = await previewImport(req.params.id);
      res.status(200).json(preview);
    })
  );

  router.post(
    "/api/import/jobs/:id/confirm-template",
    wrap(async (req: Request, res: Response) => {
      const templateDecision = templateDecisionSchema.parse(req.body);
      const result = await confirmTemplate(
        req.params.id,
        templateDecision as TemplateSuggestionResult
      );
      res.status(200).json(result);
    })
  );

  router.post(
    "/api/import/jobs/:id/run",
    wrap(async (req: Request, res: Response) => {
      const result = await runImport(req.params.id);
      res.status(200).json(result);
    })
  );

  return router;
}
