"""Fetch and compare direct downstream connections for one pipeline hotspot."""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
from neuprint import fetch_simple_connections

from neuprint_common import get_client, result_dir


PROJECT_DIR = Path(__file__).resolve().parents[1]
RESULTS_DIR = PROJECT_DIR / "data" / "results"


def safe_label(value: object) -> str:
    """Make text safe to use in a result-folder name."""
    text = str(value) if pd.notna(value) else "unknown"
    return "".join(char if char.isalnum() or char in "-_" else "_" for char in text)


def load_type_neurons(cell_type: str) -> pd.DataFrame:
    """Reuse the annotations and sides already saved by step 2."""
    neuron_file = RESULTS_DIR / safe_label(cell_type) / "neurons.csv"
    if not neuron_file.exists():
        raise SystemExit(
            f"Missing {neuron_file}. Run 02_find_neurons.py --type {cell_type} first."
        )

    neurons = pd.read_csv(neuron_file)
    if neurons.empty or "bodyId" not in neurons.columns:
        raise SystemExit(f"No usable neurons were found in {neuron_file}.")
    return neurons


def find_saved_neuron(body_id: int) -> pd.Series | None:
    """Find a saved label for a manually supplied body ID when possible."""
    for neuron_file in RESULTS_DIR.glob("*/neurons.csv"):
        neurons = pd.read_csv(neuron_file)
        if "bodyId" not in neurons.columns:
            continue
        matching = neurons.loc[neurons["bodyId"] == body_id]
        if not matching.empty:
            return matching.iloc[0]
    return None


def manual_neurons(body_ids: list[int]) -> pd.DataFrame:
    """Build a small neuron table for one-off body-ID analysis."""
    rows = []
    for body_id in body_ids:
        saved = find_saved_neuron(body_id)
        if saved is None:
            rows.append({"bodyId": body_id, "instance": f"body_{body_id}"})
        else:
            rows.append(saved.to_dict())
    return pd.DataFrame(rows)


def neuron_label(neuron: pd.Series) -> str:
    """Prefer the instance because it usually records the L/R side."""
    instance = neuron.get("instance")
    if pd.notna(instance) and str(instance).strip():
        return safe_label(instance)

    cell_type = safe_label(neuron.get("type", "neuron"))
    side = safe_label(neuron.get("somaSide", "unknown"))
    return f"{cell_type}_{side}"


def fetch_downstream(body_ids: list[int], min_weight: int) -> pd.DataFrame:
    """Fetch once at the smallest threshold for all requested neurons."""
    connections = fetch_simple_connections(
        upstream_criteria=body_ids,
        downstream_criteria=None,
        min_weight=min_weight,
        properties=["type", "instance", "status", "cropped"],
        weight_props=["weight"],
        client=get_client(),
    )
    return connections.sort_values("weight", ascending=False).reset_index(drop=True)


def threshold_rows(
    connections: pd.DataFrame,
    label: str,
    body_id: int,
    thresholds: list[int],
) -> list[dict]:
    """Measure how much direct-connection data survives each threshold."""
    rows = []
    for threshold in thresholds:
        kept = connections.loc[connections["weight"] >= threshold]
        rows.append(
            {
                "source_label": label,
                "source_body_id": body_id,
                "min_weight": threshold,
                "connection_count": len(kept),
                "strongest_weight": int(kept["weight"].max()) if not kept.empty else None,
                "weakest_weight": int(kept["weight"].min()) if not kept.empty else None,
            }
        )
    return rows


def output_folder(
    args: argparse.Namespace, label: str, body_id: int, neuron_count: int
) -> str:
    """Keep manual one-neuron naming while separating multi-neuron results."""
    if args.body_id and neuron_count == 1 and args.name:
        return args.name
    return f"{label}_{body_id}_probe"


def review_folder(args: argparse.Namespace) -> str:
    """Choose one predictable folder for the combined parameter report."""
    if args.name:
        return f"{safe_label(args.name)}_review"
    subject = args.type if args.type else "manual"
    behavior = args.behavior or "candidate"
    return f"{safe_label(behavior)}_{safe_label(subject)}_review"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument(
        "--type",
        help="Exact cell type already processed by 02_find_neurons.py",
    )
    source.add_argument(
        "--body-id",
        type=int,
        nargs="+",
        help="One or more specific body IDs",
    )
    parser.add_argument("--behavior", help="Behavior label for the review folder")
    parser.add_argument("--name", help="Optional custom result name")
    parser.add_argument(
        "--min-weights",
        type=int,
        nargs="+",
        default=[1, 5, 10, 20, 40],
        help="Direct-edge thresholds tested locally after one neuPrint fetch",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=100,
        help="Direct partners kept per neuron in the review shortlist",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.top < 1:
        raise SystemExit("--top must be at least 1.")
    if any(weight < 1 for weight in args.min_weights):
        raise SystemExit("Every --min-weights value must be at least 1.")

    thresholds = sorted(set(args.min_weights))
    neurons = load_type_neurons(args.type) if args.type else manual_neurons(args.body_id)
    body_ids = neurons["bodyId"].astype(int).tolist()

    # Only the smallest threshold is sent to neuPrint. Every other threshold is
    # calculated from the same returned table, so parameter testing is cheap.
    all_connections = fetch_downstream(body_ids, thresholds[0])
    comparison_tables = []
    parameter_rows = []

    for _, neuron in neurons.iterrows():
        body_id = int(neuron["bodyId"])
        label = neuron_label(neuron)
        connections = all_connections.loc[
            all_connections["bodyId_pre"] == body_id
        ].copy()
        connections = connections.sort_values("weight", ascending=False)

        out = result_dir(output_folder(args, label, body_id, len(neurons)))
        connections.to_csv(out / "downstream_all.csv", index=False)
        connections.head(args.top).to_csv(out / "downstream_top.csv", index=False)

        preview = connections.head(args.top).copy()
        preview.insert(0, "source_label", label)
        preview.insert(1, "source_body_id", body_id)
        comparison_tables.append(preview)
        parameter_rows.extend(
            threshold_rows(connections, label, body_id, thresholds)
        )

    review_dir = result_dir(review_folder(args))
    comparison = pd.concat(comparison_tables, ignore_index=True)
    comparison.to_csv(review_dir / "downstream_comparison.csv", index=False)
    pd.DataFrame(parameter_rows).to_csv(
        review_dir / "parameter_report.csv", index=False
    )

    print(f"Analyzed {len(neurons)} starting neuron(s).")
    print(f"Review direct connections and thresholds in {review_dir}")
    print("No final threshold or biological target was selected automatically.")


if __name__ == "__main__":
    main()
