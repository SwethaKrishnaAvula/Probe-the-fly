import json
import math
from pathlib import Path


# SETTINGS

INPUT_DIR = Path("path_jsons")
OUTPUT_DIR = INPUT_DIR / "math_filled"

HOP_DURATION_MS = 300
MIN_BRIGHTNESS = 0.4


# LOAD FILES

def load_json_files(folder):
    files = []

    for path in folder.glob("*.json"):
        with open(path, "r") as f:
            data = json.load(f)

        files.append((path, data))

    return files


# GLOBAL NORMALIZATION VALUES

def get_global_max_path_score(files):
    """
    Finds the largest path_strength_score across all hotspot JSON files.

    normalized route strength =
        path_strength_score / largest path_strength_score
    """
    scores = []

    for _, data in files:
        score = data.get("math_inputs", {}).get("path_strength_score")

        if score is not None:
            scores.append(float(score))

    return max(scores) if scores else 1.0


def get_global_max_edge_score(files):
    """
    Finds the strongest individual connection across every path.

    Uses log(1 + weight) so very large synapse counts
    do not dominate the visualization.
    """
    scores = []

    for _, data in files:
        for node in data.get("path", [])[1:]:
            weight = node.get("incoming_connection_weight", 0)

            if weight > 0:
                scores.append(math.log1p(weight))

    return max(scores) if scores else 1.0


# PULSE TIMING

def make_pulse_timing(path):
    """
    Activates neurons sequentially.

    Example:
        neuron 1: 0-300 ms
        neuron 2: 300-600 ms
        neuron 3: 600-900 ms
    """
    timing = []

    for i, node in enumerate(path):
        start = i * HOP_DURATION_MS
        end = start + HOP_DURATION_MS

        timing.append({
            "body_id": node["body_id"],
            "t_start_ms": start,
            "t_end_ms": end
        })

    return timing


# NORMALIZED PATH STRENGTH

def normalized_path_strength(data, global_max):
    score = data.get("math_inputs", {}).get("path_strength_score")

    if score is None:
        return None

    return round(float(score) / global_max, 4)


# BRIGHTNESS

def make_brightness(path, global_max_edge_score):
    """
    Starting hotspot is always fully bright.

    Every later neuron's brightness is based on the strength
    of the connection entering that neuron.

    normalized edge strength =
        log(1 + weight) / global maximum log strength

    brightness =
        MIN_BRIGHTNESS +
        (1 - MIN_BRIGHTNESS) * normalized_strength
    """
    brightness = []

    for i, node in enumerate(path):

        # Player directly activates the hotspot
        if i == 0:
            value = 1.0

        else:
            weight = node.get("incoming_connection_weight", 0)

            edge_score = math.log1p(max(weight, 0))

            normalized = (
                edge_score / global_max_edge_score
                if global_max_edge_score > 0
                else 0
            )

            value = MIN_BRIGHTNESS + (
                (1.0 - MIN_BRIGHTNESS) * normalized
            )

        brightness.append({
            "body_id": node["body_id"],
            "value": round(value, 4)
        })

    return brightness


# FILL ONE JSON

def fill_math_outputs(data, max_path_score, max_edge_score):
    path = data.get("path", [])

    data["math_outputs"] = {
        "pulse_timing": make_pulse_timing(path),
        "normalized_strength": normalized_path_strength(
            data,
            max_path_score
        ),
        "brightness": make_brightness(
            path,
            max_edge_score
        )
    }

    return data


# MAIN

def main():
    files = load_json_files(INPUT_DIR)

    if not files:
        print(f"No JSON files found in {INPUT_DIR}")
        return

    OUTPUT_DIR.mkdir(exist_ok=True)

    # These are calculated ONCE using all paths.
    max_path_score = get_global_max_path_score(files)
    max_edge_score = get_global_max_edge_score(files)

    print(f"Found {len(files)} path JSON files")
    print(f"Max path score: {max_path_score:.4f}")
    print(f"Max edge log-strength: {max_edge_score:.4f}")
    print()

    for path, data in files:
        updated = fill_math_outputs(
            data,
            max_path_score,
            max_edge_score
        )

        output_path = OUTPUT_DIR / path.name

        with open(output_path, "w") as f:
            json.dump(updated, f, indent=2)

        print(f"Filled: {path.name}")

    print()
    print(f"Finished. Updated files are in: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()