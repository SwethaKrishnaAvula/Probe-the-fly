"""Export SWC skeletons for any completed hotspot handoff."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from neuprint import fetch_skeleton

from neuprint_common import get_client


PROJECT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_GEOMETRY_DIR = PROJECT_DIR / "game_data" / "geometry"

# Reused in order when a path contains more neurons than colors.
COLOR_PALETTE = [
    [0.05, 0.80, 0.20, 1.0],
    [0.90, 0.05, 0.55, 1.0],
    [0.10, 0.45, 0.95, 1.0],
    [0.95, 0.60, 0.05, 1.0],
    [0.55, 0.20, 0.90, 1.0],
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--handoff",
        type=Path,
        required=True,
        help="Path to a completed handoff.json file",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_GEOMETRY_DIR,
        help="Folder for SWC files and the Blender export config",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Download an SWC again even when it already exists",
    )
    return parser.parse_args()


def load_handoff(path: Path) -> dict:
    """Load a handoff and check that it contains a usable neuron path."""
    if not path.is_absolute():
        path = PROJECT_DIR / path
    if not path.exists():
        raise SystemExit(f"Handoff file not found: {path}")

    handoff = json.loads(path.read_text(encoding="utf-8"))
    if not handoff.get("hotspot_id"):
        raise SystemExit("The handoff is missing hotspot_id.")
    if not handoff.get("path"):
        raise SystemExit("The handoff does not contain any path neurons.")

    for neuron in handoff["path"]:
        if "body_id" not in neuron:
            raise SystemExit("Every handoff path neuron must contain body_id.")

    return handoff


def unique_body_ids(handoff: dict) -> list[int]:
    """Keep the path order while removing accidental duplicate IDs."""
    return list(dict.fromkeys(int(neuron["body_id"]) for neuron in handoff["path"]))


def export_skeletons(body_ids: list[int], output_dir: Path, overwrite: bool) -> None:
    """Download only the SWC files that are missing or explicitly replaced."""
    output_dir.mkdir(parents=True, exist_ok=True)
    client = None

    for body_id in body_ids:
        output_path = output_dir / f"{body_id}.swc"
        if output_path.exists() and not overwrite:
            print(f"Using existing {output_path}")
            continue

        # Connect only when at least one skeleton actually needs downloading.
        if client is None:
            client = get_client()
        fetch_skeleton(
            body_id,
            format="swc",
            export_path=output_path,
            client=client,
        )
        print(f"Saved {output_path}")


def write_blender_config(handoff: dict, body_ids: list[int], output_dir: Path) -> Path:
    """Tell Blender which local skeletons belong to this path."""
    config = {
        "hotspot_id": handoff["hotspot_id"],
        "body_ids": [str(body_id) for body_id in body_ids],
        "swc_files": {
            str(body_id): f"{body_id}.swc"
            for body_id in body_ids
        },
        "colors": {
            str(body_id): COLOR_PALETTE[index % len(COLOR_PALETTE)]
            for index, body_id in enumerate(body_ids)
        },
        "output_glb": f"{handoff['hotspot_id']}.glb",
        "target_size": 20.0,
        "tube_radius": 0.025,
    }

    config_path = output_dir / "blender_export_config.json"
    config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    print(f"Saved Blender config to {config_path}")
    return config_path


def main() -> None:
    args = parse_args()
    handoff = load_handoff(args.handoff)
    body_ids = unique_body_ids(handoff)
    output_dir = args.output_dir.resolve()

    export_skeletons(body_ids, output_dir, args.overwrite)
    write_blender_config(handoff, body_ids, output_dir)


if __name__ == "__main__":
    main()
