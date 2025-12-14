# Python Worker for Excel ingestion

This service keeps the heavy Excel parsing logic in Python so the Node.js
orchestrators can focus on workflow control. It exposes HTTP endpoints that
can be called from `apps/api` (preview) and `apps/worker` (run) to handle
any `.xlsx` upload.

## Endpoints
- `GET /health`: simple availability check.
- `POST /preview`: accepts `multipart/form-data` with `file` (Excel) and
  returns sheet metadata plus up to 50 sample rows per sheet. You can filter
  to a single sheet by providing a `sheet` query string parameter and the
  response includes navigation hints (`previous`/`next`) to move across the
  workbook.
- `POST /normalize`: same upload contract, but returns the whole sheet as
  JSON (string values) up to 10,000 rows per sheet for downstream inserts.
  The optional `sheet` query parameter also works here to limit processing to
  a single worksheet.
- `POST /ml/pipeline`: returns an ML-oriented profile per sheet (missingness,
  outlier caps, encoded feature preview, and the preprocessing steps
  configured for that sheet). It accepts the same upload contract as the
  other endpoints plus an optional `sample_rows` query parameter (defaults to
  2,000) to keep processing bounded.

## Local development
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r apps/python-worker/requirements.txt
uvicorn apps.python-worker.main:app --reload
```

With the server running, you can test uploads:
```bash
curl -F "file=@/path/to/any.xlsx" http://localhost:8000/preview
```

## Quick preview of the provided sample Excels
Sample spreadsheets are stored in the repo-level `excels/` directory. You can
exercise the parsing logic locally without starting the FastAPI server:

```bash
python apps/python-worker/preview_excels.py
```

Pass your own file or directory paths to target different inputs:

```bash
python apps/python-worker/preview_excels.py excels/another-folder /tmp/custom.xlsx
```

## Integration notes
- Keep Excel parsing in this worker; avoid heavy binary handling inside
  serverless functions.
- Responses are intentionally string-typed to avoid pandas coercion; let
  the Node.js layer enforce schemas once templates are confirmed.
- The worker is stateless; the orchestrator should persist results in
  MongoDB and tie them to the import job ID.
