"""Package one verified path for the math teammate using local CSV files."""

from __future__ import annotations

import argparse
import ast
import json
import shutil
from pathlib import Path

import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parents[1]
RESULTS_DIR = PROJECT_DIR / "data" / "results"
HANDOFFS_DIR = PROJECT_DIR / "data" / "handoffs"


def find_local_rows(filename: str, column: str, value: int) -> tuple[pd.DataFrame, list[Path]]:
    """Find matching rows in all saved result files with the given name."""
    matches = []
    sources = []

    for csv_path in RESULTS_DIR.glob(f"*/{filename}"):
        table = pd.read_csv(csv_path)
        if column not in table.columns:
            continue

        rows = table.loc[table[column] == value].copy()
        if not rows.empty:
            matches.append(rows)
            sources.append(csv_path)

    if not matches:
        return pd.DataFrame(), []

    return pd.concat(matches, ignore_index=True).drop_duplicates(), sources


def parse_roi_info(value: object) -> dict:
    """Turn the saved conn_roiInfo text back into a dictionary."""
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not value:
        return {}

    try:
        parsed = ast.literal_eval(value)
    except (SyntaxError, ValueError):
        return {}

    return parsed if isinstance(parsed, dict) else {}


def load_path(result_name: str) -> tuple[Path, pd.DataFrame, float | None]:
    """Load the selected path and its existing score."""
    result_dir = RESULTS_DIR / result_name
    path_file = result_dir / "best_path.csv"
    score_file = result_dir / "path_scores.csv"

    if not path_file.exists():
        raise SystemExit(f"Missing path file: {path_file}")

    path = pd.read_csv(path_file)
    required = {"path", "bodyId", "type", "weight"}
    if not required.issubset(path.columns):
        raise SystemExit(f"{path_file} is missing required columns: {sorted(required)}")
    if len(path) < 2:
        raise SystemExit("A handoff path must contain at least two neurons.")

    score = None
    if score_file.exists():
        scores = pd.read_csv(score_file)
        if "strength_score" in scores.columns and not scores.empty:
            score = float(scores.iloc[0]["strength_score"])

    return result_dir, path, score


def load_hotspot_metadata(body_id: int) -> tuple[pd.Series, list[Path]]:
    """Load the first path neuron's saved annotation."""
    neurons, sources = find_local_rows("neurons.csv", "bodyId", body_id)
    if neurons.empty:
        raise SystemExit(
            f"No local neuron annotation found for hotspot body ID {body_id}."
        )
    return neurons.iloc[0], sources


def load_hotspot_rois(body_id: int) -> tuple[list[dict], list[Path]]:
    """Load locally saved ROI counts for the hotspot."""
    roi_rows, sources = find_local_rows("roi_counts.csv", "bodyId", body_id)
    if roi_rows.empty:
        return [], []

    columns = [c for c in ("roi", "pre", "post", "downstream", "upstream") if c in roi_rows]
    return roi_rows[columns].to_dict(orient="records"), sources


def verify_path_edges(path: pd.DataFrame) -> tuple[pd.DataFrame, list[Path]]:
    """Confirm that every neighboring pair exists in saved downstream data."""
    verified_edges = []
    source_files = []

    for index in range(len(path) - 1):
        source_id = int(path.iloc[index]["bodyId"])
        target_id = int(path.iloc[index + 1]["bodyId"])
        connections, sources = find_local_rows(
            "downstream_all.csv", "bodyId_pre", source_id
        )

        if connections.empty:
            raise SystemExit(
                f"No local downstream data found for path neuron {source_id}."
            )

        edge = connections.loc[connections["bodyId_post"] == target_id]
        if edge.empty:
            raise SystemExit(
                f"Local data does not contain path edge {source_id} -> {target_id}."
            )

        selected = edge.sort_values("weight", ascending=False).iloc[0].copy()
        expected_weight = int(path.iloc[index + 1]["weight"])
        if int(selected["weight"]) != expected_weight:
            raise SystemExit(
                f"Weight mismatch for {source_id} -> {target_id}: "
                f"path has {expected_weight}, connection file has {int(selected['weight'])}."
            )

        selected["roi_names"] = sorted(parse_roi_info(selected.get("conn_roiInfo")).keys())
        verified_edges.append(selected)
        source_files.extend(sources)

    return pd.DataFrame(verified_edges), source_files


def relative_paths(paths: list[Path]) -> list[str]:
    """Make source paths easy to read on another teammate's computer."""
    return sorted({str(path.relative_to(PROJECT_DIR)) for path in paths})


def build_manifest(
    args: argparse.Namespace,
    path: pd.DataFrame,
    score: float | None,
    hotspot: pd.Series,
    hotspot_rois: list[dict],
    edges: pd.DataFrame,
    source_files: list[Path],
) -> dict:
    """Build the JSON handoff without adding pulse timings."""
    path_nodes = []
    for index, row in path.reset_index(drop=True).iterrows():
        role = "hotspot" if index == 0 else "motor_output" if index == len(path) - 1 else "intermediate"
        path_nodes.append(
            {
                "body_id": int(row["bodyId"]),
                "type": None if pd.isna(row["type"]) else str(row["type"]),
                "role": role,
                "incoming_connection_weight": int(row["weight"]),
            }
        )

    edge_rois = sorted(
        {
            roi
            for roi_list in edges["roi_names"]
            for roi in roi_list
        }
    )

    return {
        "hotspot_id": args.hotspot_id,
        "behavior_id": args.behavior_id,
        "dataset": "male-cns:v1.0",
        "hotspot": {
            "body_id": int(hotspot["bodyId"]),
            "type": None if pd.isna(hotspot.get("type")) else str(hotspot.get("type")),
            "instance": None if pd.isna(hotspot.get("instance")) else str(hotspot.get("instance")),
            "side": None if pd.isna(hotspot.get("somaSide")) else str(hotspot.get("somaSide")),
            "superclass": None if pd.isna(hotspot.get("superclass")) else str(hotspot.get("superclass")),
        },
        "path": path_nodes,
        "route": {
            "strategy": args.strategy,
            "hop_count": len(path_nodes) - 1,
            "connection_rois": edge_rois,
        },
        "evidence": {
            "behavior_citation": args.citation,
            "confidence_note": args.confidence_note,
            "connectivity_source": "Male CNS neuPrint v1.0",
        },
        "math_inputs": {
            "raw_connection_weights": [int(weight) for weight in edges["weight"]],
            "path_strength_score": score,
        },
        "math_outputs": {
            "pulse_timing": None,
            "normalized_strength": None,
            "brightness": None,
        },
        "hotspot_roi_counts_file": "hotspot_roi_counts.csv",
        "source_files": relative_paths(source_files),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--result-name", required=True, help="Folder under data/results")
    parser.add_argument("--hotspot-id", required=True)
    parser.add_argument("--behavior-id", required=True)
    parser.add_argument("--strategy", required=True)
    parser.add_argument("--citation", required=True)
    parser.add_argument("--confidence-note", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result_dir, path, score = load_path(args.result_name)

    hotspot_id = int(path.iloc[0]["bodyId"])
    hotspot, neuron_sources = load_hotspot_metadata(hotspot_id)
    hotspot_rois, roi_sources = load_hotspot_rois(hotspot_id)
    edges, connection_sources = verify_path_edges(path)

    source_files = [
        result_dir / "best_path.csv",
        result_dir / "path_scores.csv",
        *neuron_sources,
        *roi_sources,
        *connection_sources,
    ]
    source_files = [path for path in source_files if path.exists()]

    manifest = build_manifest(
        args,
        path,
        score,
        hotspot,
        hotspot_rois,
        edges,
        source_files,
    )

    out = HANDOFFS_DIR / args.hotspot_id
    out.mkdir(parents=True, exist_ok=True)
    (out / "handoff.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    shutil.copyfile(result_dir / "best_path.csv", out / "best_path.csv")
    edges.to_csv(out / "connections.csv", index=False)
    pd.DataFrame(hotspot_rois).to_csv(out / "hotspot_roi_counts.csv", index=False)

    print(f"Saved math handoff to {out}")


if __name__ == "__main__":
    main()
