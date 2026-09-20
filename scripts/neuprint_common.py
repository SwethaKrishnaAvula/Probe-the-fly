"""Shared configuration for the Male CNS neuPrint scripts."""

from __future__ import annotations

import os
from pathlib import Path

from neuprint import Client


SERVER = "https://neuprint.janelia.org"
DATASET = "male-cns:v1.0"
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "data" / "results"


def safe_name(value: object) -> str:
    """Convert a label to the filename-safe form used throughout the pipeline."""
    text = str(value)
    if value is None or text in {"", "nan", "<NA>", "NaT", "None"}:
        text = "unknown"
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in text)


def get_client() -> Client:
    """Create a client without ever placing a token in source code."""
    # Read the private token from the terminal environment, not from a file.
    token = os.environ.get("NEUPRINT_APPLICATION_CREDENTIALS")
    kwargs = {"dataset": DATASET}
    if token:
        kwargs["token"] = token
    return Client(SERVER, **kwargs)


def result_dir(name: str) -> Path:
    path = OUTPUT_DIR / safe_name(name)
    path.mkdir(parents=True, exist_ok=True)
    return path