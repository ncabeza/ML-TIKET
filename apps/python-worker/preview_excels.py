"""CLI helper to preview Excel files using the Python worker parser."""
from __future__ import annotations

import argparse
import pandas as pd
from pathlib import Path
from typing import Dict, Iterable, List

from main import _load_excel, _load_sheet_frames
from ml_pipeline import build_ml_preview

EXCEL_SUFFIXES = {".xls", ".xlsx", ".xlsm", ".xlsb"}
DEFAULT_EXCEL_DIR = Path(__file__).resolve().parents[2] / "excels"


def _discover_excel_files(paths: Iterable[Path]) -> List[Path]:
    files: List[Path] = []

    for path in paths:
        if path.is_dir():
            candidates = [
                candidate
                for candidate in sorted(path.iterdir())
                if candidate.suffix.lower() in EXCEL_SUFFIXES
            ]
            files.extend(candidates)
        elif path.is_file() and path.suffix.lower() in EXCEL_SUFFIXES:
            files.append(path)
        else:
            print(f"Skipping unsupported path: {path}")

    return files


def _summarize_excel(file_path: Path, sample_rows: int) -> None:
    file_bytes = file_path.read_bytes()
    sheets = _load_excel(file_bytes, sample_rows=sample_rows)

    print(f"\n{file_path.name} ({len(sheets)} sheets)")
    for sheet in sheets:
        columns = sheet["columns"]
        column_preview = ", ".join(columns[:5])
        if len(columns) > 5:
            column_preview += ", \u2026"

        print(
            "  • "
            f"{sheet['sheet']}: {sheet['sample_row_count']} rows, "
            f"columns: {column_preview if column_preview else 'none found'}"
        )


def _summarize_ml_profiles(
    file_path: Path, *, max_rows_per_sheet: int, missingness_top_k: int = 3
) -> None:
    file_bytes = file_path.read_bytes()
    frames: Dict[str, pd.DataFrame] = _load_sheet_frames(
        file_bytes, max_rows_per_sheet=max_rows_per_sheet
    )

    print("    ML interpretation:")
    for sheet_name, frame in frames.items():
        ml_preview = build_ml_preview(frame)

        missing_sorted = sorted(
            ml_preview.missingness.items(), key=lambda item: item[1], reverse=True
        )
        missing_head = missing_sorted[:missingness_top_k]
        missing_text = (
            ", ".join(f"{col}={pct:.0%}" for col, pct in missing_head)
            if missing_head
            else "sin nulos detectados"
        )

        total_outliers = sum(summary["capped"] for summary in ml_preview.outliers.values())
        feature_rows = len(ml_preview.feature_preview)
        feature_dim = len(ml_preview.feature_names)

        print(
            "    • "
            f"{sheet_name}: top nulos {missing_text}; "
            f"outliers recortados {total_outliers}; "
            f"matriz de features {feature_rows}x{feature_dim}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Preview the sheets detected by the Python worker using local Excel files. "
            "If no paths are provided, the script looks in the repo-level 'excels' folder."
        )
    )
    parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        help="Excel files or directories containing Excel files",
    )
    parser.add_argument(
        "--sample-rows",
        type=int,
        default=50,
        help="Number of rows to sample per sheet (defaults to 50)",
    )
    parser.add_argument(
        "--no-ml",
        dest="ml_enabled",
        action="store_false",
        help="Skip the ML profiling step (enabled by default).",
    )
    parser.add_argument(
        "--ml-rows",
        type=int,
        default=500,
        help=(
            "Maximum rows per sheet to use for the ML preview (defaults to 500). "
            "Higher values give richer stats but increase processing time."
        ),
    )
    parser.set_defaults(ml_enabled=True)

    args = parser.parse_args()

    search_paths = args.paths or []
    if not search_paths:
        if DEFAULT_EXCEL_DIR.exists():
            search_paths = [DEFAULT_EXCEL_DIR]
        else:
            parser.error(
                "No paths provided and default Excel directory missing at "
                f"{DEFAULT_EXCEL_DIR}"
            )

    excel_files = _discover_excel_files(search_paths)
    if not excel_files:
        parser.error("No Excel files found in the provided paths.")

    for file_path in excel_files:
        _summarize_excel(file_path, sample_rows=args.sample_rows)
        if args.ml_enabled:
            _summarize_ml_profiles(
                file_path, max_rows_per_sheet=args.ml_rows, missingness_top_k=3
            )


if __name__ == "__main__":
    main()
