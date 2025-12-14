"""FastAPI service to process Excel uploads with Python.

This worker focuses on the heavy parsing/normalization steps that are
harder to keep in the Node.js stack. It exposes an HTTP interface that
other services can call during the preview/run phases of the import
pipeline.
"""
from io import BytesIO
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set

import asyncio
import pandas as pd
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

from ml_pipeline import build_ml_preview

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
    sheet_names: Optional[List[str]] = None,
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

    if sheet_names:
        requested: Set[str] = set(sheet_names)
        available: Set[str] = set(workbook.sheet_names)
        missing = requested - available
        if missing:
            missing_list = ", ".join(sorted(missing))
            raise HTTPException(
                status_code=404,
                detail=f"Sheet(s) not found: {missing_list}",
            )

    for sheet_name in workbook.sheet_names:
        if sheet_names and sheet_name not in sheet_names:
            continue
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
        full_row_count = len(records)

        if full_row_count > max_rows_per_sheet:
            truncated = True
            records = records[:max_rows_per_sheet]

        if not columns:
            empty_frame = workbook.parse(sheet_name, nrows=0, dtype=str)
            columns = list(empty_frame.columns)

        preview_rows = records[:sample_rows]
        sample_row_count = len(preview_rows)
        total_rows = full_row_count

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


def _load_sheet_frames(
    file_bytes: bytes,
    *,
    max_rows_per_sheet: int = 5_000,
    sheet_names: Optional[List[str]] = None,
) -> Dict[str, pd.DataFrame]:
    """Load worksheets into pandas DataFrames for ML processing."""

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty upload received")

    try:
        workbook = pd.ExcelFile(BytesIO(file_bytes))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid Excel file: {exc}") from exc

    if sheet_names:
        requested: Set[str] = set(sheet_names)
        available: Set[str] = set(workbook.sheet_names)
        missing = requested - available
        if missing:
            missing_list = ", ".join(sorted(missing))
            raise HTTPException(
                status_code=404,
                detail=f"Sheet(s) not found: {missing_list}",
            )

    frames: Dict[str, pd.DataFrame] = {}
    for sheet_name in workbook.sheet_names:
        if sheet_names and sheet_name not in sheet_names:
            continue
        frame = pd.read_excel(
            workbook,
            sheet_name=sheet_name,
            dtype=str,
            nrows=max_rows_per_sheet,
            engine=workbook.engine,
        )
        frames[sheet_name] = frame

    if not frames:
        raise HTTPException(status_code=404, detail="No sheets found in workbook")

    return frames


async def _load_excel_async(
    file_bytes: bytes,
    *,
    sample_rows: int = 50,
    max_rows_per_sheet: int = 50_000,
    sheet_names: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Run the CPU-bound Excel parsing in a thread executor."""

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None,
        lambda: _load_excel(
            file_bytes,
            sample_rows=sample_rows,
            max_rows_per_sheet=max_rows_per_sheet,
            sheet_names=sheet_names,
        ),
    )


class ExcelProcessingQueue:
    """Tiny FIFO queue to serialize Excel parsing tasks.

    This keeps concurrent uploads from overwhelming the server while still
    keeping the FastAPI handlers async-friendly.
    """

    def __init__(self) -> None:
        self._queue: asyncio.Queue[
            tuple[Callable[[], Awaitable[Any]], asyncio.Future[Any]]
        ] = asyncio.Queue()
        self._worker_started = False

    async def _ensure_worker(self) -> None:
        if self._worker_started:
            return
        self._worker_started = True
        asyncio.create_task(self._worker())

    async def _worker(self) -> None:
        while True:
            coro_factory, future = await self._queue.get()
            try:
                result = await coro_factory()
            except Exception as exc:  # pragma: no cover - defensive
                future.set_exception(exc)
            else:
                future.set_result(result)
            finally:
                self._queue.task_done()

    async def enqueue(self, coro_factory: Callable[[], Awaitable[Any]]) -> Any:
        await self._ensure_worker()
        loop = asyncio.get_running_loop()
        future: asyncio.Future[Any] = loop.create_future()
        await self._queue.put((coro_factory, future))
        return await future


processing_queue = ExcelProcessingQueue()


def _build_navigation(
    sheets: List[Dict[str, Any]], requested_sheet: Optional[str]
) -> Optional[SheetCursor]:
    if not sheets:
        return None

    sheet_names = [sheet["sheet"] for sheet in sheets]
    current = requested_sheet if requested_sheet in sheet_names else sheet_names[0]

    try:
        current_index = sheet_names.index(current)
    except ValueError:  # pragma: no cover - defensive fallback
        current_index = 0
        current = sheet_names[0]

    previous_sheet = sheet_names[current_index - 1] if current_index > 0 else None
    next_sheet = (
        sheet_names[current_index + 1]
        if current_index + 1 < len(sheet_names)
        else None
    )

    return SheetCursor(
        current=current,
        available=sheet_names,
        previous=previous_sheet,
        next=next_sheet,
    )


class SheetPreview(BaseModel):
    sheet: str
    columns: List[str]
    sample_row_count: int
    preview_rows: List[Dict[str, Any]]
    total_rows: int
    truncated: bool


class SheetCursor(BaseModel):
    current: str
    available: List[str]
    previous: Optional[str]
    next: Optional[str]


class PreviewResponse(BaseModel):
    filename: str
    sheets: List[SheetPreview]
    total_sheets: int
    total_rows_estimate: Optional[int]
    navigation: Optional[SheetCursor]


class OutlierSummary(BaseModel):
    column: str
    lower_cap: float
    upper_cap: float
    capped_values: int


class SheetMLPreview(BaseModel):
    sheet: str
    missingness: Dict[str, float]
    outliers: List[OutlierSummary]
    feature_names: List[str]
    feature_preview: List[List[float]]
    pipeline_steps: List[str]


class MLPipelineResponse(BaseModel):
    filename: str
    sheets: List[SheetMLPreview]


@app.get("/health")
def healthcheck() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/preview", response_model=PreviewResponse)
async def preview_excel(
    file: UploadFile = File(...),  # noqa: B008
    sheet: Optional[str] = Query(
        None,
        description=(
            "Optional sheet name to preview. When omitted, all sheets are parsed and "
            "returned."
        ),
    ),
) -> PreviewResponse:
    """Parse an uploaded Excel file and return normalized sheet previews."""

    file_bytes = await file.read()
    sheet_filter = [sheet] if sheet else None
    sheets: List[Dict[str, Any]] = await processing_queue.enqueue(
        lambda: _load_excel_async(file_bytes, sheet_names=sheet_filter)
    )

    total_rows_estimate = sum(sheet_item["total_rows"] for sheet_item in sheets)

    return PreviewResponse(
        filename=file.filename,
        sheets=[SheetPreview(**sheet_item) for sheet_item in sheets],
        total_sheets=len(sheets),
        total_rows_estimate=total_rows_estimate,
        navigation=_build_navigation(sheets, requested_sheet=sheet),
    )


@app.post("/normalize", response_model=Dict[str, Any])
async def normalize_excel(
    file: UploadFile = File(...),  # noqa: B008
    sheet: Optional[str] = Query(
        None,
        description=(
            "Optional sheet name to normalize. Defaults to processing every sheet "
            "in the workbook."
        ),
    ),
) -> Dict[str, Any]:
    """
    Normalize an uploaded Excel file to row-wise JSON for downstream use.

    The endpoint keeps data as strings to avoid pandas type coercion and
    returns a compact payload that the Node.js orchestrator can persist or
    batch-send to MongoDB.
    """

    file_bytes = await file.read()
    sheet_filter = [sheet] if sheet else None
    sheets: List[Dict[str, Any]] = await processing_queue.enqueue(
        lambda: _load_excel_async(
            file_bytes,
            sample_rows=10_000,
            max_rows_per_sheet=10_000,
            sheet_names=sheet_filter,
        )
    )

    navigation = _build_navigation(sheets, requested_sheet=sheet)

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
        "navigation": navigation.dict() if navigation else None,
    }


@app.post("/ml/pipeline", response_model=MLPipelineResponse)
async def ml_pipeline_preview(
    file: UploadFile = File(...),  # noqa: B008
    sheet: Optional[str] = Query(
        None,
        description=(
            "Optional sheet name to process. When omitted, all sheets are parsed and "
            "evaluated for ML readiness."
        ),
    ),
    sample_rows: int = Query(
        2_000,
        ge=50,
        le=10_000,
        description=(
            "Cap on rows loaded per sheet to keep ML profiling responsive. "
            "Defaults to 2,000 rows."
        ),
    ),
) -> MLPipelineResponse:
    """Return ML-friendly profiling for uploaded Excel sheets."""

    file_bytes = await file.read()
    sheet_filter = [sheet] if sheet else None
    frames = _load_sheet_frames(
        file_bytes, max_rows_per_sheet=sample_rows, sheet_names=sheet_filter
    )

    summaries: List[SheetMLPreview] = []
    for sheet_name, frame in frames.items():
        ml_preview = build_ml_preview(frame)
        summaries.append(
            SheetMLPreview(
                sheet=sheet_name,
                missingness=ml_preview.missingness,
                outliers=[
                    OutlierSummary(
                        column=col,
                        lower_cap=summary["lower"],
                        upper_cap=summary["upper"],
                        capped_values=summary["capped"],
                    )
                    for col, summary in ml_preview.outliers.items()
                ],
                feature_names=ml_preview.feature_names,
                feature_preview=ml_preview.feature_preview,
                pipeline_steps=ml_preview.pipeline_steps,
            )
        )

    return MLPipelineResponse(filename=file.filename, sheets=summaries)
