import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

from weak_spot import compute_weak_spots


load_dotenv(
    dotenv_path=Path(__file__).with_name(".env"),
    override=True
)


RECALL_QUERY = """
WITH ranked AS (
    SELECT
        hotspot_id,
        correct,
        response_ms,
        time,
        notebook_visible,
        ROW_NUMBER() OVER (
            PARTITION BY hotspot_id
            ORDER BY time DESC
        ) AS rn
    FROM probe_events
    WHERE player_id = %s
      AND notebook_visible = FALSE
      AND correct IS NOT NULL
)
SELECT
    hotspot_id,
    correct,
    response_ms,
    time,
    notebook_visible
FROM ranked
WHERE rn <= 20
ORDER BY hotspot_id, time;
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


def get_player_recall(player_id, top_n=3):
    """
    Fetch a player's recent scored probes from Tiger
    and return recall metrics + weakest hotspots.
    """

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(RECALL_QUERY, (player_id,))
            rows = cur.fetchall()

    return compute_weak_spots(
        rows,
        top_n=top_n
    )
