"""Find Male CNS neuron IDs for a literature-backed cell type."""

from __future__ import annotations

import argparse

from neuprint import NeuronCriteria as NC
from neuprint import fetch_neurons

from neuprint_common import get_client, result_dir


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--type", required=True, help="Exact cell type or regex")
    parser.add_argument(
        "--regex",
        action="store_true",
        help="Interpret --type as a regular expression (useful while exploring names)",
    )
    args = parser.parse_args()

    client = get_client()
    # Build the search using the cell type supplied in the command.
    criteria = NC(type=args.type, regex=args.regex)
    neurons, roi_counts = fetch_neurons(criteria, client=client)

    # Save both the neuron details and their brain-region counts.
    out = result_dir(args.type)
    neurons.to_csv(out / "neurons.csv", index=False)
    roi_counts.to_csv(out / "roi_counts.csv", index=False)

    print(f"Found {len(neurons)} neuron(s).")
    print(f"Saved results in {out}")
    if not neurons.empty:
        # Keep the terminal preview smaller than the saved CSV file.
        columns = [
            c
            for c in ("bodyId", "type", "instance", "status", "cropped", "pre", "post")
            if c in neurons
        ]
        print(neurons[columns].to_string(index=False))


if __name__ == "__main__":
    main()
