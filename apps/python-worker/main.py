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


def _load_excel(
    file_bytes: bytes,
    sample_rows: int = 50,
    *,
    max_rows_per_sheet: int = 50_000,
) -> List[Dict[str, Any]]:
    """Load the Excel workbook and extract lightweight previews per sheet.

    The parser keeps memory usage bounded by capping the number of scanned rows.
    A truncated flag indicates when a sheet exceeded the configured ceiling so
    callers can react accordingly.
    """

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty upload received")

    try:
        workbook = pd.ExcelFile(BytesIO(file_bytes))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid Excel file: {exc}") from exc

    sheets: List[Dict[str, Any]] = []

    for sheet_name in workbook.sheet_names:
        truncated = False
        frame = pd.read_excel(
            workbook,
            sheet_name=sheet_name,
            dtype=str,
            nrows=max_rows_per_sheet + 1,
            engine=workbook.engine,
        )

        columns: List[str] = list(frame.columns)
        filled = frame.fillna("")
        records = filled.to_dict(orient="records")

        if len(records) > max_rows_per_sheet:
            truncated = True
            records = records[:max_rows_per_sheet]

        if not columns:
            empty_frame = workbook.parse(sheet_name, nrows=0, dtype=str)
            columns = list(empty_frame.columns)

        preview_rows = records[:sample_rows]
        sample_row_count = len(preview_rows)
        total_rows = len(records)

        sheets.append(
            {
                "sheet": sheet_name,
                "columns": columns,
                "sample_row_count": sample_row_count,
                "preview_rows": preview_rows,
                "total_rows": total_rows,
                "truncated": truncated,
            }
        )

    return sheets


class SheetPreview(BaseModel):
    sheet: str
    columns: List[str]
    sample_row_count: int
    preview_rows: List[Dict[str, Any]]
    total_rows: int
    truncated: bool


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

    total_rows_estimate = sum(sheet["total_rows"] for sheet in sheets)

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
    sheets = _load_excel(file_bytes, sample_rows=10_000, max_rows_per_sheet=10_000)

    normalized = {
        sheet["sheet"]: sheet["preview_rows"] for sheet in sheets
    }
    metadata = {
        sheet["sheet"]: {
            "total_rows": sheet["total_rows"],
            "truncated": sheet["truncated"],
        }
        for sheet in sheets
    }

    return {
        "filename": file.filename,
        "sheets": normalized,
        "metadata": metadata,
    }
