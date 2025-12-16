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

## Quickstart (Debian/Ubuntu)

Sigue estos pasos para poner el repositorio en marcha rápidamente en una distro basada en Debian:

1. Instala dependencias de sistema (Node 18+ y Python 3.10+):
   ```bash
   sudo apt-get update
   sudo apt-get install -y python3.10 python3.10-venv python3-pip
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
2. Instala paquetes del monorepo:
   ```bash
   npm install
   ```
3. Prepara y activa el entorno del worker de Excel en Python:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r apps/python-worker/requirements.txt
   ```
4. Arranca el worker de FastAPI en modo autoreload:
   ```bash
   uvicorn apps.python-worker.main:app --reload
   ```
   Valida rápidamente con un Excel de ejemplo incluido en `excels/`:
   ```bash
   curl -F "file=@excels/NOMINAS CIBERNOS - The Tiket.xlsx" http://localhost:8000/preview
   ```
5. Ejecuta la verificación de tipos para asegurarte de que los paquetes de Node compilan:
   ```bash
   npm run typecheck
   ```

Consulta `docs/desarrollador.md` para una guía más extensa de los flujos y endpoints.

## Validation flow

- 📄 Detailed Spanish overview: [`docs/validation-flow-es.md`](docs/validation-flow-es.md)
- 🤖 Guía de ML para parsear Excel sin perder estructura: [`docs/ml-excel-es.md`](docs/ml-excel-es.md)
- 🧭 Flujo end-to-end Avant → Cibernos → Operaciones: [`docs/automatizacion-tickets-ml.md`](docs/automatizacion-tickets-ml.md)
