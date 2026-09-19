"""Discover candidate endpoints or verify a path to an approved target."""

from __future__ import annotations

import argparse
import ast
import math
import re
from pathlib import Path

import pandas as pd
from neuprint import fetch_paths, fetch_simple_connections

from neuprint_common import get_client, result_dir


PROJECT_DIR = Path(__file__).resolve().parents[1]
RESULTS_DIR = PROJECT_DIR / "data" / "results"

REVIEW_COLUMNS = [
    "start_body_id",
    "start_instance",
    "endpoint_body_id",
    "endpoint_type",
    "endpoint_instance",
    "endpoint_status",
    "endpoint_cropped",
    "matched_target_pattern",
    "hop_count",
    "path_score",
    "path_body_ids",
    "path_types",
    "path_instances",
    "edge_weights",
    "trace_command",
]


def safe_result_name(value: str) -> str:
    """Use the same folder-name rules as the other pipeline scripts."""
    return "".join(char if char.isalnum() or char in "-_" else "_" for char in value)


def read_saved_neurons(cell_type: str) -> pd.DataFrame:
    """Load the cell-type results already created in step 2."""
    path = RESULTS_DIR / safe_result_name(cell_type) / "neurons.csv"
    if not path.exists():
        raise SystemExit(
            f"Missing {path}. Run 02_find_neurons.py --type {cell_type} first."
        )

    neurons = pd.read_csv(path)
    if neurons.empty or "bodyId" not in neurons:
        raise SystemExit(f"No usable neurons were found in {path}.")
    return neurons


def read_local_connections(body_id: int, min_weight: int) -> pd.DataFrame:
    """Reuse a complete local downstream file when its weights go low enough."""
    matches = []
    for path in RESULTS_DIR.glob("*/downstream_all.csv"):
        table = pd.read_csv(path)
        if "bodyId_pre" not in table or "weight" not in table:
            continue
        rows = table.loc[table["bodyId_pre"] == body_id].copy()
        if not rows.empty:
            matches.append(rows)

    if not matches:
        return pd.DataFrame()

    connections = pd.concat(matches, ignore_index=True).drop_duplicates(
        subset=["bodyId_pre", "bodyId_post", "weight"]
    )

    # A smallest saved weight above our threshold may mean weaker rows were
    # filtered out during an earlier download, so fetch again in that case.
    if connections["weight"].min() > min_weight:
        return pd.DataFrame()

    return connections.loc[connections["weight"] >= min_weight].copy()


def fetch_missing_connections(
    body_ids: list[int], min_weight: int, client
) -> pd.DataFrame:
    """Fetch several frontier neurons together to reduce API requests."""
    if not body_ids:
        return pd.DataFrame()

    connections = fetch_simple_connections(
        upstream_criteria=body_ids,
        downstream_criteria=None,
        min_weight=min_weight,
        properties=["type", "instance", "status", "cropped"],
        weight_props=["weight"],
        client=client,
    )
    return connections.sort_values("weight", ascending=False).reset_index(drop=True)


def connection_table(
    body_ids: list[int], min_weight: int, client
) -> tuple[pd.DataFrame, set[int]]:
    """Combine reusable local rows with any rows that still need downloading."""
    tables = []
    fetched_ids = []

    for body_id in body_ids:
        local = read_local_connections(body_id, min_weight)
        if local.empty:
            fetched_ids.append(body_id)
        else:
            tables.append(local)

    fetched = fetch_missing_connections(fetched_ids, min_weight, client)
    if not fetched.empty:
        tables.append(fetched)

    if not tables:
        return pd.DataFrame(), set(fetched_ids)

    combined = pd.concat(tables, ignore_index=True).drop_duplicates(
        subset=["bodyId_pre", "bodyId_post", "weight"]
    )
    return combined, set(fetched_ids)


def path_score(weights: list[int]) -> float:
    """Reward strong edges while slightly preferring shorter paths."""
    if not weights:
        return 0.0
    average_log_weight = sum(math.log1p(weight) for weight in weights) / len(weights)
    return average_log_weight - 0.15 * (len(weights) - 1)


def endpoint_matches(node: dict, target_pattern: re.Pattern) -> bool:
    """Check both the type and instance because annotations vary by neuron."""
    label = f"{node.get('type', '')} {node.get('instance', '')}"
    return bool(target_pattern.search(label))


def make_start_path(neuron: pd.Series) -> dict:
    """Create the first node of one left/right search."""
    node = {
        "body_id": int(neuron["bodyId"]),
        "type": None if pd.isna(neuron.get("type")) else str(neuron.get("type")),
        "instance": None
        if pd.isna(neuron.get("instance"))
        else str(neuron.get("instance")),
        "status": None if pd.isna(neuron.get("status")) else str(neuron.get("status")),
        "cropped": None
        if pd.isna(neuron.get("cropped"))
        else bool(neuron.get("cropped")),
    }
    return {
        "start_body_id": node["body_id"],
        "start_instance": node["instance"],
        "nodes": [node],
        "weights": [],
    }


def node_from_connection(connection: pd.Series) -> dict:
    """Keep the endpoint fields needed during biological review."""
    cropped = connection.get("cropped_post")
    return {
        "body_id": int(connection["bodyId_post"]),
        "type": None
        if pd.isna(connection.get("type_post"))
        else str(connection.get("type_post")),
        "instance": None
        if pd.isna(connection.get("instance_post"))
        else str(connection.get("instance_post")),
        "status": None
        if pd.isna(connection.get("status_post"))
        else str(connection.get("status_post")),
        "cropped": None if pd.isna(cropped) else bool(cropped),
    }


def expand_paths(
    paths: list[dict], connections: pd.DataFrame, branch_limit: int
) -> list[dict]:
    """Extend each path with its strongest non-cyclic downstream partners."""
    expanded = []

    for path in paths:
        source_id = path["nodes"][-1]["body_id"]
        existing_ids = {node["body_id"] for node in path["nodes"]}
        rows = connections.loc[connections["bodyId_pre"] == source_id]
        rows = rows.sort_values("weight", ascending=False).head(branch_limit)

        for _, connection in rows.iterrows():
            node = node_from_connection(connection)
            if node["body_id"] in existing_ids:
                continue

            weights = [*path["weights"], int(connection["weight"])]
            expanded.append(
                {
                    "start_body_id": path["start_body_id"],
                    "start_instance": path["start_instance"],
                    "nodes": [*path["nodes"], node],
                    "weights": weights,
                    "score": path_score(weights),
                }
            )

    return expanded


def keep_best_paths(paths: list[dict], beam_width: int) -> list[dict]:
    """Limit each starting neuron's search so it cannot grow without bound."""
    kept = []
    start_ids = {path["start_body_id"] for path in paths}
    for start_id in start_ids:
        matching = [path for path in paths if path["start_body_id"] == start_id]
        kept.extend(sorted(matching, key=lambda path: path["score"], reverse=True)[:beam_width])
    return kept


def path_row(path: dict, matched_target: bool, args: argparse.Namespace) -> dict:
    """Flatten a path into one row that a teammate can review in a CSV."""
    endpoint = path["nodes"][-1]
    body_ids = [str(node["body_id"]) for node in path["nodes"]]
    types = [str(node.get("type") or "") for node in path["nodes"]]
    instances = [str(node.get("instance") or "") for node in path["nodes"]]
    target_id = endpoint["body_id"]
    result_name = f"{args.behavior}_{path['start_body_id']}_to_{target_id}"

    return {
        "start_body_id": path["start_body_id"],
        "start_instance": path["start_instance"],
        "endpoint_body_id": target_id,
        "endpoint_type": endpoint.get("type"),
        "endpoint_instance": endpoint.get("instance"),
        "endpoint_status": endpoint.get("status"),
        "endpoint_cropped": endpoint.get("cropped"),
        "matched_target_pattern": matched_target,
        "hop_count": len(path["weights"]),
        "path_score": round(path["score"], 6),
        "path_body_ids": " -> ".join(body_ids),
        "path_types": " -> ".join(types),
        "path_instances": " -> ".join(instances),
        "edge_weights": " -> ".join(str(weight) for weight in path["weights"]),
        "trace_command": (
            f"python scripts/04_build_paths.py --start {path['start_body_id']} "
            f"--target {target_id} --name {result_name} --min-weight "
            f"{args.min_weight} --max-hops {args.max_hops} --path-mode general"
        ),
    }


def find_saved_rows(filename: str, column: str, value: int) -> pd.DataFrame:
    """Find one neuron's rows across the locally saved result files."""
    matches = []
    for path in RESULTS_DIR.glob(f"*/{filename}"):
        table = pd.read_csv(path)
        if column not in table.columns:
            continue
        rows = table.loc[table[column] == value].copy()
        if not rows.empty:
            matches.append(rows)
    if not matches:
        return pd.DataFrame()
    return pd.concat(matches, ignore_index=True).drop_duplicates()


def load_hotspot(body_id: int) -> pd.Series:
    """Load the starting neuron's annotation saved by step 2."""
    neurons = find_saved_rows("neurons.csv", "bodyId", body_id)
    if neurons.empty:
        raise SystemExit(
            f"Body ID {body_id} is missing from local neurons.csv files. "
            "Run 02_find_neurons.py for its cell type first."
        )
    return neurons.iloc[0]


def is_descending_neuron(neuron: pd.Series) -> bool:
    """Recognize a DN from its superclass or type name."""
    superclass = str(neuron.get("superclass", "")).lower()
    neuron_type = str(neuron.get("type", ""))
    return superclass == "descending_neuron" or neuron_type.startswith("DN")


def connection_is_in_vnc(connection: pd.Series) -> bool:
    """Read the saved connection ROI information without another ROI query."""
    roi_info = connection.get("conn_roiInfo", "")
    if isinstance(roi_info, str):
        try:
            roi_info = ast.literal_eval(roi_info)
        except (SyntaxError, ValueError):
            return False
    return isinstance(roi_info, dict) and "VNC" in roi_info


def direct_motor_connections(body_id: int, min_weight: int) -> pd.DataFrame:
    """Return direct VNC partners whose annotation looks like a motor neuron."""
    connections = find_saved_rows("downstream_all.csv", "bodyId_pre", body_id)
    if connections.empty:
        raise SystemExit(
            f"No local downstream data found for body ID {body_id}. "
            "Run 03_analyze_downstream.py first."
        )
    connections = connections.loc[connections["weight"] >= min_weight].copy()
    target_types = connections["type_post"].fillna("").astype(str)
    motor_mask = target_types.str.contains(
        r"(?:^|\s)MN(?:$|\s|_)|motor", case=False, regex=True
    )
    vnc_mask = connections.apply(connection_is_in_vnc, axis=1)
    return connections.loc[motor_mask & vnc_mask].sort_values(
        "weight", ascending=False
    )


def make_direct_path(hotspot: pd.Series, connection: pd.Series) -> pd.DataFrame:
    """Put a direct edge into the same format as a multi-hop result."""
    return pd.DataFrame(
        [
            {
                "path": 0,
                "bodyId": int(hotspot["bodyId"]),
                "type": hotspot.get("type"),
                "weight": 0,
            },
            {
                "path": 0,
                "bodyId": int(connection["bodyId_post"]),
                "type": connection.get("type_post"),
                "weight": int(connection["weight"]),
            },
        ]
    )


def local_vnc_neurons() -> set[int]:
    """Collect IDs whose step-2 ROI file includes the VNC."""
    body_ids: set[int] = set()
    for path in RESULTS_DIR.glob("*/roi_counts.csv"):
        roi_counts = pd.read_csv(path)
        if {"bodyId", "roi"}.issubset(roi_counts.columns):
            rows = roi_counts.loc[roi_counts["roi"] == "VNC", "bodyId"]
            body_ids.update(rows.astype(int))
    return body_ids


def trace_to_target(
    start: int,
    target: int,
    min_weight: int,
    max_hops: int,
    require_dn: bool,
    require_vnc: bool,
) -> pd.DataFrame:
    """Ask neuPrint for short paths and apply the selected biological checks."""
    paths = fetch_paths(
        start,
        target,
        min_weight=min_weight,
        max_path_length=max_hops,
        timeout=30.0,
        client=get_client(),
    )
    if paths.empty:
        return paths

    valid_ids = set(paths["path"].unique())
    if require_dn:
        dn_ids = set(
            paths.loc[
                paths["type"].fillna("").astype(str).str.startswith("DN"),
                "path",
            ]
        )
        valid_ids &= dn_ids

    if require_vnc:
        vnc_ids = local_vnc_neurons()
        paths_with_vnc = set(paths.loc[paths["bodyId"].isin(vnc_ids), "path"])
        valid_ids &= paths_with_vnc

    return paths.loc[paths["path"].isin(valid_ids)].copy()


def verified_paths(args: argparse.Namespace) -> tuple[pd.DataFrame, str]:
    """Verify an approved target using general or neuron-aware rules."""
    hotspot = load_hotspot(args.start)

    if args.path_mode == "general":
        return (
            trace_to_target(
                args.start,
                args.target,
                args.min_weight,
                args.max_hops,
                require_dn=False,
                require_vnc=False,
            ),
            "general_candidate_to_reviewed_target",
        )

    if is_descending_neuron(hotspot):
        direct_motor = direct_motor_connections(args.start, args.min_weight)
        selected = direct_motor.loc[direct_motor["bodyId_post"] == args.target]
        if not selected.empty:
            return (
                make_direct_path(hotspot, selected.iloc[0]),
                "descending_neuron_direct_motor",
            )
        return (
            trace_to_target(
                args.start,
                args.target,
                args.min_weight,
                args.max_hops,
                require_dn=False,
                require_vnc=True,
            ),
            "descending_neuron_via_vnc",
        )

    return (
        trace_to_target(
            args.start,
            args.target,
            args.min_weight,
            args.max_hops,
            require_dn=True,
            require_vnc=True,
        ),
        "brain_hotspot_via_descending_neuron",
    )


def verified_path_score(path: pd.DataFrame) -> float:
    """Use the established handoff score for a verified path."""
    weights = path.loc[path["weight"] > 0, "weight"]
    return float(sum(math.log1p(float(weight)) for weight in weights))


def save_verified_paths(paths: pd.DataFrame, strategy: str, name: str) -> None:
    """Save outputs in the format expected by steps 5 and 6."""
    out = result_dir(name)
    paths.to_csv(out / "paths_all.csv", index=False)
    if paths.empty:
        print("No valid path found with the selected target and parameters.")
        return

    scores = (
        paths.groupby("path", sort=False)
        .apply(verified_path_score)
        .rename("strength_score")
        .sort_values(ascending=False)
    )
    scores.to_csv(out / "path_scores.csv")
    best_path_id = scores.index[0]
    paths.loc[paths["path"] == best_path_id].to_csv(
        out / "best_path.csv", index=False
    )
    print(
        f"Saved {len(scores)} verified path(s) to {out}; "
        f"best path={best_path_id}, strategy={strategy}"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--type", help="Saved cell type used for endpoint discovery")
    parser.add_argument("--behavior", help="Behavior label used during discovery")
    parser.add_argument("--start", type=int, help="Starting body ID for verification")
    parser.add_argument("--target", type=int, help="Biology-approved target body ID")
    parser.add_argument("--min-weight", type=int, default=10)
    parser.add_argument("--max-hops", type=int, default=3)
    parser.add_argument(
        "--branch-limit",
        type=int,
        default=25,
        help="Strongest outgoing partners kept from each neuron",
    )
    parser.add_argument(
        "--beam-width",
        type=int,
        default=150,
        help="Highest-scoring unfinished paths kept per starting neuron",
    )
    parser.add_argument(
        "--target-pattern",
        default=r"(?:^|\s)MN(?:$|\s|_)|motor|proboscis",
        help="Case-insensitive regex used to flag possible endpoints",
    )
    parser.add_argument(
        "--name",
        help="Custom result folder name",
    )
    parser.add_argument(
        "--path-mode",
        choices=["auto", "general"],
        default="auto",
        help="auto applies neuron-class rules; general verifies a reviewed route",
    )
    return parser.parse_args()


def run_discovery(args: argparse.Namespace) -> None:
    """Discover endpoints when no biology-approved target is available yet."""
    if args.min_weight < 1 or args.max_hops < 1:
        raise SystemExit("--min-weight and --max-hops must be at least 1.")
    if args.branch_limit < 1 or args.beam_width < 1:
        raise SystemExit("--branch-limit and --beam-width must be at least 1.")

    try:
        target_pattern = re.compile(args.target_pattern, flags=re.IGNORECASE)
    except re.error as error:
        raise SystemExit(f"Invalid --target-pattern: {error}") from error

    neurons = read_saved_neurons(args.type)
    active_paths = [make_start_path(neuron) for _, neuron in neurons.iterrows()]
    candidate_paths = []
    used_connections = []
    fetched_body_ids: set[int] = set()
    search_rows = []
    client = get_client()

    for depth in range(1, args.max_hops + 1):
        frontier_ids = sorted({path["nodes"][-1]["body_id"] for path in active_paths})
        connections, fetched_ids = connection_table(
            frontier_ids, args.min_weight, client
        )
        fetched_body_ids.update(fetched_ids)
        if connections.empty:
            break

        used_connections.append(connections)
        expanded = expand_paths(active_paths, connections, args.branch_limit)
        if not expanded:
            break

        unfinished = []
        endpoints_at_depth = 0
        for path in expanded:
            if endpoint_matches(path["nodes"][-1], target_pattern):
                candidate_paths.append(path)
                endpoints_at_depth += 1
            else:
                unfinished.append(path)

        active_paths = keep_best_paths(unfinished, args.beam_width)
        search_rows.append(
            {
                "depth": depth,
                "frontier_neuron_count": len(frontier_ids),
                "connection_count": len(connections),
                "expanded_path_count": len(expanded),
                "endpoint_path_count": endpoints_at_depth,
                "unfinished_path_count": len(unfinished),
                "retained_path_count": len(active_paths),
                "min_weight": args.min_weight,
                "branch_limit": args.branch_limit,
                "beam_width": args.beam_width,
            }
        )
        if not active_paths:
            break

    output_name = args.name or f"{args.behavior}_{args.type}_discovery"
    output_dir = result_dir(output_name)

    if used_connections:
        all_connections = pd.concat(used_connections, ignore_index=True)
        all_connections = all_connections.drop_duplicates(
            subset=["bodyId_pre", "bodyId_post", "weight"]
        )
    else:
        all_connections = pd.DataFrame()
    all_connections.to_csv(output_dir / "downstream_all.csv", index=False)

    candidate_rows = [path_row(path, True, args) for path in candidate_paths]
    candidates = pd.DataFrame(candidate_rows, columns=REVIEW_COLUMNS)
    if not candidates.empty:
        candidates = candidates.sort_values(
            ["start_body_id", "path_score"], ascending=[True, False]
        )
    candidates.to_csv(output_dir / "endpoint_candidates.csv", index=False)

    frontier_rows = [path_row(path, False, args) for path in active_paths]
    frontier = pd.DataFrame(frontier_rows, columns=REVIEW_COLUMNS)
    if not frontier.empty:
        frontier = frontier.sort_values(
            ["start_body_id", "path_score"], ascending=[True, False]
        )
    frontier.to_csv(output_dir / "frontier_paths.csv", index=False)
    pd.DataFrame(search_rows).to_csv(output_dir / "search_report.csv", index=False)

    print(f"Saved discovery review files in {output_dir}")
    print(f"Possible endpoint path(s): {len(candidates)}")
    print(f"Unmatched frontier path(s): {len(frontier)}")
    print(f"New downstream neuron(s) queried: {len(fetched_body_ids)}")
    print("No endpoint was automatically accepted. Review endpoint_candidates.csv.")


def main() -> None:
    args = parse_args()
    if args.target is not None:
        if args.start is None:
            raise SystemExit("Verification requires both --start and --target.")
        name = args.name or f"candidate_{args.start}_to_{args.target}"
        paths, strategy = verified_paths(args)
        save_verified_paths(paths, strategy, name)
        return

    if not args.type or not args.behavior:
        raise SystemExit(
            "Discovery requires --type and --behavior when --target is omitted."
        )
    run_discovery(args)


if __name__ == "__main__":
    main()
