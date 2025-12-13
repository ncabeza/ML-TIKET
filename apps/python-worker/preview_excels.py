"""CLI helper to preview Excel files using the Python worker parser."""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable, List

from main import _load_excel

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


if __name__ == "__main__":
    main()
