# ML-TIKET – Smart Excel Import & Automation

This repository sketches the Smart Excel Import & Automation module for **The Tiket** using React, TypeScript, Node, MongoDB, Vercel, a dedicated Worker, a Vector Database for semantic similarity, **and a Python worker for Excel handling**.

## Architecture

```
React (Import Canvas)
        ↓
Vercel API (orchestration)
        ↓
Worker ML (Railway / Render / Fly.io)
        ↓
┌──────────────┬─────────────────┬────────────────────┐
│ MongoDB      │ Vector Database │ Python Excel Worker │
│ (truth)      │ (similarity)    │ (parsing/preview)   │
└──────────────┴─────────────────┴────────────────────┘
```

### Guiding principles
- MongoDB is the source of truth; Vector DB is only for semantic similarity.
- Machine Learning **assists**; it never creates tickets or templates automatically.
- Import is always two-phase: preview → run.
- Ambiguity is blocked; every irreversible action requires user confirmation.
- Templates are versioned contracts; tickets always reference `template_id + version`.

### Components
- **apps/api**: Vercel-style handlers that orchestrate preview/run flows and delegate heavy work to a worker.
- **apps/worker**: ML-assisted pipeline implementing structural inference, compression, template similarity, missingness analysis, validation, and background ticket creation with idempotency hooks.
- **apps/web**: React Import Canvas wizard for upload → mode selection → structural preview → ML-assisted mapping → template resolution → validation → background execution.
- **packages/shared**: Canonical TypeScript types reflecting MongoDB models and ML artifacts.
- **apps/python-worker**: FastAPI service that parses any Excel upload, delivers sheet previews, and returns normalized JSON for downstream validation and ticket creation.

## Pipelines

- **Preview**: `parseExcelNative → buildStructuralTree → compressStructure → classifyColumns → detectMissingness → matchTemplates`.
- **Run**: `validateHardRules → createTicketsInBatches` (requires user-confirmed template/version; blocks MNAR risk).
- **Python ingestion**: `parse Excel in FastAPI → preview sheets (50 rows) → normalize rows (string-typed) → persist via Node orchestrator`.

## Endpoints

- `POST /api/import/jobs`
- `POST /api/import/jobs/:id/preview`
- `POST /api/import/jobs/:id/confirm-template`
- `POST /api/import/jobs/:id/run`
- `GET /api/import/jobs/:id`
- `GET /api/import/jobs/:id/errors.xlsx`

### Python worker endpoints
- `GET /health`
- `POST /preview`
- `POST /normalize`

These files provide a blueprint for the production implementation, preserving the enterprise constraints described in the specification.
