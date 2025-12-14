"""Utilities to prepare Excel sheets for ML pipelines.

The helpers in this module operationalize the blueprint for intelligent Excel
processing: they normalize schemas, cap outliers, impute missing values, and
produce a reproducible feature matrix that downstream models can consume.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


@dataclass
class MLPreview:
    """Container with the artifacts required to describe ML readiness."""

    missingness: Dict[str, float]
    outliers: Dict[str, Dict[str, float]]
    feature_names: List[str]
    feature_preview: List[List[float]]
    pipeline_steps: List[str]


def _split_column_types(frame: pd.DataFrame) -> Tuple[pd.DataFrame, List[str], List[str]]:
    """Infer numeric vs categorical columns using simple heuristics."""

    numeric_columns: List[str] = []
    categorical_columns: List[str] = []
    coerced = frame.copy()

    for column in frame.columns:
        series = pd.to_numeric(frame[column], errors="coerce")
        numeric_share = float(series.notna().mean()) if len(series) else 0.0
        unique_values = frame[column].nunique(dropna=True)

        if numeric_share > 0.6 and unique_values > 3:
            coerced[column] = series
            numeric_columns.append(column)
        else:
            categorical_columns.append(column)

    return coerced, numeric_columns, categorical_columns


def _missingness_by_column(frame: pd.DataFrame) -> Dict[str, float]:
    return {column: float(frame[column].isna().mean()) for column in frame.columns}


def _iqr_cap(
    frame: pd.DataFrame, numeric_columns: List[str]
) -> Tuple[pd.DataFrame, Dict[str, Dict[str, float]]]:
    """Cap numeric outliers using the IQR rule and report caps."""

    capped = frame.copy()
    summary: Dict[str, Dict[str, float]] = {}

    for column in numeric_columns:
        series = pd.to_numeric(frame[column], errors="coerce")
        if series.empty:
            continue
        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        clipped = series.clip(lower=lower, upper=upper)
        summary[column] = {
            "lower": float(lower),
            "upper": float(upper),
            "capped": int((clipped != series).sum()),
        }
        capped[column] = clipped

    return capped, summary


def _build_feature_matrix(
    frame: pd.DataFrame, numeric_columns: List[str], categorical_columns: List[str]
) -> Tuple[np.ndarray, List[str]]:
    """Fit a lightweight preprocessing pipeline and return the feature matrix."""

    transformers = []

    if numeric_columns:
        transformers.append(
            (
                "numeric",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                numeric_columns,
            )
        )

    if categorical_columns:
        transformers.append(
            (
                "categorical",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        (
                            "encoder",
                            OneHotEncoder(handle_unknown="ignore", drop="first"),
                        ),
                    ]
                ),
                categorical_columns,
            )
        )

    transformer = ColumnTransformer(transformers=transformers, remainder="drop")

    features = transformer.fit_transform(frame)
    if hasattr(features, "toarray"):
        features = features.toarray()

    feature_names = transformer.get_feature_names_out().tolist()
    return features, feature_names


def build_ml_preview(frame: pd.DataFrame, *, feature_preview_rows: int = 25) -> MLPreview:
    """Construct a compact ML readiness report for a sheet DataFrame."""

    if frame.empty:
        return MLPreview(
            missingness={},
            outliers={},
            feature_names=[],
            feature_preview=[],
            pipeline_steps=[],
        )

    coerced, numeric_columns, categorical_columns = _split_column_types(frame)
    missingness = _missingness_by_column(coerced)

    capped, outlier_summary = _iqr_cap(coerced, numeric_columns)
    if not numeric_columns and not categorical_columns:
        return MLPreview(
            missingness=missingness,
            outliers=outlier_summary,
            feature_names=[],
            feature_preview=[],
            pipeline_steps=[],
        )

    feature_matrix, feature_names = _build_feature_matrix(
        capped, numeric_columns, categorical_columns
    )

    preview = feature_matrix[:feature_preview_rows].tolist()
    pipeline_steps = [
        "Numeric: median imputation + Z-score scaling",
        "Categorical: most-frequent imputation + one-hot encoding (drop_first)",
        "Outliers: capped with IQR rule",
    ]

    return MLPreview(
        missingness=missingness,
        outliers=outlier_summary,
        feature_names=feature_names,
        feature_preview=preview,
        pipeline_steps=pipeline_steps,
    )
