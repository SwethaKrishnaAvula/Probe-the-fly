from collections import defaultdict
from datetime import datetime
from statistics import median
from typing import Any, Dict, List, Optional


MAX_PROBES_PER_HOTSPOT = 20
MIN_PROBES_FOR_WEAK_SPOT = 3

RECENCY_DECAY = 0.90
ACCURACY_WEIGHT = 0.75
RESPONSE_TIME_WEIGHT = 0.25
RESPONSE_TIME_CAP_MS = 5000

SHAKY_THRESHOLD = 0.25
WEAK_THRESHOLD = 0.50


def _parse_time(value: Any) -> Optional[datetime]:
    """Return a datetime for either DB datetime values or ISO strings."""
    if value is None:
        return None

    if isinstance(value, datetime):
        return value

    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _weighted_accuracy(events: List[Dict[str, Any]]) -> Optional[float]:
    """
    Compute recent-weighted accuracy.

    Events must be ordered oldest -> newest.
    The newest probe gets weight 1.0, then 0.9, 0.9^2, ...
    """
    if not events:
        return None

    weighted_correct = 0.0
    total_weight = 0.0

    for age, event in enumerate(reversed(events)):
        weight = RECENCY_DECAY ** age
        correct = 1.0 if bool(event["correct"]) else 0.0

        weighted_correct += weight * correct
        total_weight += weight

    return weighted_correct / total_weight if total_weight else None


def _median_response_ms(events: List[Dict[str, Any]]) -> Optional[float]:
    """Return the median non-negative response time."""
    times = [
        float(event["response_ms"])
        for event in events
        if isinstance(event.get("response_ms"), (int, float))
        and event["response_ms"] >= 0
    ]

    return median(times) if times else None


def _status_from_weakness(score: float) -> str:
    """Map weakness score to a player-facing recall category."""
    if score >= WEAK_THRESHOLD:
        return "weak"
    if score >= SHAKY_THRESHOLD:
        return "shaky"
    return "strong"


def score_hotspot(events: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Score one hotspot from its recent probe history.

    weakness =
        0.75 * (1 - weighted_accuracy)
        + 0.25 * normalized_median_response_time

    Higher weakness means poorer recall.
    """
    if not events:
        return None

    events = events[-MAX_PROBES_PER_HOTSPOT:]

    accuracy = _weighted_accuracy(events)
    if accuracy is None:
        return None

    response_ms = _median_response_ms(events)
    error_score = 1.0 - accuracy

    response_norm = (
        min(response_ms / RESPONSE_TIME_CAP_MS, 1.0)
        if response_ms is not None
        else 0.0
    )

    weakness = (
        ACCURACY_WEIGHT * error_score
        + RESPONSE_TIME_WEIGHT * response_norm
    )

    return {
        "n_probes": len(events),
        "weighted_accuracy": round(accuracy, 4),
        "median_response_ms": (
            round(response_ms, 1) if response_ms is not None else None
        ),
        "weakness_score": round(weakness, 4),
        "status": _status_from_weakness(weakness),
        "eligible_for_weak_spot": len(events) >= MIN_PROBES_FOR_WEAK_SPOT,
    }


def compute_weak_spots(
    events: List[Dict[str, Any]],
    top_n: int = 3,
) -> Dict[str, Any]:
    """
    Compute per-hotspot recall metrics and select the weakest hotspots.

    Expected event fields:
        hotspot_id
        correct
        response_ms
        notebook_visible

    Optional:
        time

    Rules:
      - Ignore unscored probes where correct is None.
      - Ignore probes made while the notebook was visible.
      - Use at most the most recent 20 scored probes per hotspot.
      - Require at least 3 scored probes before a hotspot can be selected.
      - Return the top N hotspots with the highest weakness score.
    """
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for index, event in enumerate(events):
        hotspot_id = event.get("hotspot_id")

        if not hotspot_id:
            continue
        if event.get("notebook_visible") is True:
            continue
        if event.get("correct") is None:
            continue

        copied = dict(event)
        copied["_input_order"] = index
        grouped[str(hotspot_id)].append(copied)

    results = []

    for hotspot_id, hotspot_events in grouped.items():
        parsed_times = [_parse_time(e.get("time")) for e in hotspot_events]

        if hotspot_events and all(t is not None for t in parsed_times):
            hotspot_events.sort(key=lambda e: _parse_time(e.get("time")))
        else:
            hotspot_events.sort(key=lambda e: e["_input_order"])

        metrics = score_hotspot(hotspot_events)
        if metrics is None:
            continue

        results.append({
            "hotspot_id": hotspot_id,
            **metrics,
        })

    results.sort(
        key=lambda item: item["weakness_score"],
        reverse=True,
    )

    weakest = [
        item["hotspot_id"]
        for item in results
        if item["eligible_for_weak_spot"]
    ][:top_n]

    return {
        "hotspots": results,
        "weakest_3": weakest,
    }
