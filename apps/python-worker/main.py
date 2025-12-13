"""FastAPI service to process Excel uploads with Python.

This worker focuses on the heavy parsing/normalization steps that are
harder to keep in the Node.js stack. It exposes an HTTP interface that
other services can call during the preview/run phases of the import
pipeline.
"""
from io import BytesIO
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

app = FastAPI(
    title="ML-TIKET Python Worker",
    description=(
        "Parses Excel files and produces normalized previews for the import "
        "canvas. Keeps heavy data wrangling in Python while the orchestration "
        "remains in Node.js."
    ),
    version="0.1.0",
)


def _load_excel(file_bytes: bytes, sample_rows: int = 50) -> List[Dict[str, Any]]:
    """Load the Excel workbook and extract lightweight previews per sheet."""

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty upload received")

    try:
        workbook = pd.ExcelFile(BytesIO(file_bytes))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid Excel file: {exc}") from exc

    sheets: List[Dict[str, Any]] = []

    for sheet_name in workbook.sheet_names:
        frame = workbook.parse(sheet_name, nrows=sample_rows, dtype=str).fillna("")
        preview_rows = frame.to_dict(orient="records")
        sheets.append(
            {
                "sheet": sheet_name,
                "columns": list(frame.columns),
                "sample_row_count": len(frame.index),
                "preview_rows": preview_rows,
            }
        )

    return sheets


class SheetPreview(BaseModel):
    sheet: str
    columns: List[str]
    sample_row_count: int
    preview_rows: List[Dict[str, Any]]


class PreviewResponse(BaseModel):
    filename: str
    sheets: List[SheetPreview]
    total_sheets: int
    total_rows_estimate: Optional[int]


@app.get("/health")
def healthcheck() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/preview", response_model=PreviewResponse)
async def preview_excel(file: UploadFile = File(...)) -> PreviewResponse:  # noqa: B008
    """Parse an uploaded Excel file and return normalized sheet previews."""

    file_bytes = await file.read()
    sheets = _load_excel(file_bytes)

    total_rows_estimate = sum(sheet["sample_row_count"] for sheet in sheets)

    return PreviewResponse(
        filename=file.filename,
        sheets=[SheetPreview(**sheet) for sheet in sheets],
        total_sheets=len(sheets),
        total_rows_estimate=total_rows_estimate,
    )


@app.post("/normalize", response_model=Dict[str, Any])
async def normalize_excel(file: UploadFile = File(...)) -> Dict[str, Any]:  # noqa: B008
    """
    Normalize an uploaded Excel file to row-wise JSON for downstream use.

    The endpoint keeps data as strings to avoid pandas type coercion and
    returns a compact payload that the Node.js orchestrator can persist or
    batch-send to MongoDB.
    """

    file_bytes = await file.read()
    sheets = _load_excel(file_bytes, sample_rows=10_000)

    normalized = {
        sheet["sheet"]: sheet["preview_rows"] for sheet in sheets
    }

    return {
        "filename": file.filename,
        "sheets": normalized,
    }
