import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row


load_dotenv(
    dotenv_path=Path(__file__).with_name(".env"),
    override=True
)


COMMUNITY_QUERY = """
SELECT
    hotspot_id,
    SUM(n_correct) AS correct_probes,
    SUM(n_total) AS total_probes,
    ROUND(
        100.0 * SUM(n_correct) / NULLIF(SUM(n_total), 0),
        1
    ) AS success_percent,
    ROUND(
        SUM(avg_ms * n_total) / NULLIF(SUM(n_total), 0),
        1
    ) AS avg_response_ms
FROM hotspot_stats_hourly
GROUP BY hotspot_id
ORDER BY hotspot_id;
"""


def get_connection():
    url = os.getenv("TIMESCALE_SERVICE_URL")

    if not url:
        raise RuntimeError(
            "TIMESCALE_SERVICE_URL is missing from .env"
        )

    return psycopg.connect(
        url,
        row_factory=dict_row
    )


def get_community_stats():
    """
    Return aggregate recall statistics for each hotspot
    across all players.
    """

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(COMMUNITY_QUERY)
            rows = cur.fetchall()

    return {
        "hotspots": [
            {
                "hotspot_id": row["hotspot_id"],
                "correct_probes": int(row["correct_probes"]),
                "total_probes": int(row["total_probes"]),
                "success_percent": float(row["success_percent"]),
                "avg_response_ms": (
                    float(row["avg_response_ms"])
                    if row["avg_response_ms"] is not None
                    else None
                ),
            }
            for row in rows
        ]
    }


if __name__ == "__main__":
    print(get_community_stats())