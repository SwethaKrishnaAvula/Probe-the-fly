import os

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row
from weak_spot import compute_weak_spots


PLAYER_ID = "00000000-0000-0000-0000-000000000001"


def get_connection():
    from pathlib import Path

    load_dotenv(
        dotenv_path=Path(__file__).with_name(".env"),
        override=True
    )

    # Tiger examples commonly provide a full connection URL.
    for key in (
        "TIMESCALE_SERVICE_URL",
        "DATABASE_URL",
        "DB_URL",
        "DATABASE_CONNECTION_STRING",
    ):
        url = os.getenv(key)
        if url:
            return psycopg.connect(url, row_factory=dict_row)

    # Also support standard PostgreSQL environment variables.
    required = ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"]

    if all(os.getenv(key) for key in required):
        return psycopg.connect(
            host=os.environ["PGHOST"],
            port=os.environ["PGPORT"],
            dbname=os.environ["PGDATABASE"],
            user=os.environ["PGUSER"],
            password=os.environ["PGPASSWORD"],
            sslmode="require",
            row_factory=dict_row,
        )

    raise RuntimeError(
        "Could not find Tiger database credentials in .env. "
        "Expected a database URL or standard PGHOST/PGPORT/etc. variables."
    )


QUERY = """
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


def main():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(QUERY, (PLAYER_ID,))
            rows = cur.fetchall()

    print("Tiger connection successful!")
    print(f"Fetched {len(rows)} probe events.")
    print()

    result = compute_weak_spots(rows)

    print("Weak-spot results:")
    print()

    for hotspot in result["hotspots"]:
        print(
            hotspot["hotspot_id"],
            "| probes:", hotspot["n_probes"],
            "| accuracy:", hotspot["weighted_accuracy"],
            "| median response:", hotspot["median_response_ms"],
            "| weakness:", hotspot["weakness_score"],
            "| status:", hotspot["status"],
        )

    print()
    print("Weakest 3:", result["weakest_3"])


if __name__ == "__main__":
    main()