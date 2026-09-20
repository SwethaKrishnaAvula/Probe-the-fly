"""Tiger Cloud (TimescaleDB) access. The service URL comes from TIMESCALE_SERVICE_URL in .env (never committed).

Tables this touches (see schema.sql):
  probe_events(time, player_id, hotspot_id, correct, response_ms, notebook_visible, + level_id, behavior_id, mistake, session_id)
  hotspot_stats_hourly(bucket, hotspot_id, n_correct, n_total, avg_ms)   -- continuous aggregate over probe_events
The extra columns are optional: the insert only uses the ones the table actually has, so an older table still works.
"""

import os
from functools import lru_cache
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env", override=False)

CORE_COLUMNS = ["time", "player_id", "hotspot_id", "correct", "response_ms", "notebook_visible"]
OPTIONAL_COLUMNS = ["level_id", "behavior_id", "mistake", "session_id"]

RECALL_QUERY = """
WITH ranked AS (
    SELECT hotspot_id, correct, response_ms, time, notebook_visible,
           ROW_NUMBER() OVER (PARTITION BY hotspot_id ORDER BY time DESC) AS rn
    FROM probe_events
    WHERE player_id = %s AND notebook_visible = FALSE AND correct IS NOT NULL
)
SELECT hotspot_id, correct, response_ms, time, notebook_visible
FROM ranked WHERE rn <= 20 ORDER BY hotspot_id, time;
"""

COMMUNITY_QUERY = """
SELECT hotspot_id,
       SUM(n_correct) AS correct_probes,
       SUM(n_total) AS total_probes,
       ROUND(100.0 * SUM(n_correct) / NULLIF(SUM(n_total), 0), 1) AS success_percent,
       ROUND(SUM(avg_ms * n_total) / NULLIF(SUM(n_total), 0), 1) AS avg_response_ms
FROM hotspot_stats_hourly GROUP BY hotspot_id ORDER BY hotspot_id;
"""

MISTAKES_QUERY = """
SELECT hotspot_id, mistake, level_id, COUNT(*) AS n, MAX(time) AS last_seen
FROM probe_events
WHERE player_id = %s AND mistake IS NOT NULL
GROUP BY hotspot_id, mistake, level_id
ORDER BY n DESC, last_seen DESC
LIMIT 50;
"""


def connect():
    url = os.getenv("TIMESCALE_SERVICE_URL")
    if not url:
        raise RuntimeError("TIMESCALE_SERVICE_URL is not set (put it in .env at the repo root)")
    return psycopg.connect(url, row_factory=dict_row, connect_timeout=10)


@lru_cache(maxsize=1)
def probe_columns():
    """Which optional columns probe_events has (checked once)."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'probe_events'")
        have = {r["column_name"] for r in cur.fetchall()}
    missing = [c for c in CORE_COLUMNS if c not in have]
    if missing:
        raise RuntimeError(f"probe_events is missing required columns: {missing}")
    return [c for c in OPTIONAL_COLUMNS if c in have]


def insert_events(player_id, events):
    cols = CORE_COLUMNS + probe_columns()
    sql = f"INSERT INTO probe_events ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))})"
    rows = [tuple({"player_id": player_id, **e}.get(c) for c in cols) for e in events]
    with connect() as conn, conn.cursor() as cur:
        cur.executemany(sql, rows)
    return len(rows)


def recent_probes(player_id):
    with connect() as conn, conn.cursor() as cur:
        cur.execute(RECALL_QUERY, (player_id,))
        return cur.fetchall()


def player_mistakes(player_id):
    if "mistake" not in probe_columns():
        return []
    with connect() as conn, conn.cursor() as cur:
        cur.execute(MISTAKES_QUERY, (player_id,))
        return cur.fetchall()


def community_stats():
    with connect() as conn, conn.cursor() as cur:
        cur.execute(COMMUNITY_QUERY)
        rows = cur.fetchall()
    return [
        {
            "hotspot_id": r["hotspot_id"],
            "correct_probes": int(r["correct_probes"]),
            "total_probes": int(r["total_probes"]),
            "success_percent": float(r["success_percent"]),
            "avg_response_ms": float(r["avg_response_ms"]) if r["avg_response_ms"] is not None else None,
        }
        for r in rows
    ]
