"""Confirm that the public Male CNS dataset can be queried."""

from neuprint import fetch_neurons

from neuprint_common import DATASET, get_client


def main() -> None:
    client = get_client()
    # Use one known cell type as a small test query.
    neurons = fetch_neurons("DNge104", omit_rois=True, client=client)
    print(f"Connected to {DATASET}")
    print(f"Test query returned {len(neurons)} DNge104 neuron(s).")
    if not neurons.empty:
        # Show only the fields that are useful for a quick access check.
        columns = [c for c in ("bodyId", "type", "instance", "status", "cropped") if c in neurons]
        print(neurons[columns].to_string(index=False))


if __name__ == "__main__":
    main()
