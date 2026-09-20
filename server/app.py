"""API between the browser game and Tiger Cloud.

Run:  python -m uvicorn server.app:app --port 8000        (vite proxies /api here in dev)

  POST /api/events                  a batch of probe events (and the mistakes attached to them)
  GET  /api/players/{id}/recall     per-hotspot recall, weakest 3, and the player's recorded mistakes
  GET  /api/community               success rate per hotspot across all players
  GET  /api/health
The game keeps working if this is down: the browser just queues and retries.
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import db
from .weak_spot import compute_weak_spots

app = FastAPI(title="Probe the fly")


class ProbeEvent(BaseModel):
    hotspot_id: str = Field(min_length=1, max_length=64)  # the level-file id, e.g. "turn_right"
    level_id: str = Field(max_length=64)
    behavior_id: Optional[str] = Field(default=None, max_length=64)
    correct: Optional[bool] = None  # None = not scored (discovery level)
    response_ms: Optional[int] = Field(default=None, ge=0, le=3_600_000)
    notebook_visible: bool = False
    mistake: Optional[str] = Field(default=None, max_length=64)  # e.g. "bonk:cheese", "soaked:sink", "dead_hotspot"
    time: Optional[datetime] = None  # client click time; the server fills it in if absent


class EventBatch(BaseModel):
    player_id: UUID
    session_id: Optional[UUID] = None
    events: list[ProbeEvent] = Field(min_length=1, max_length=200)


def _db_call(fn, *args):
    try:
        return fn(*args)
    except RuntimeError as e:  # missing config / schema
        raise HTTPException(503, str(e))
    except Exception as e:  # connection or SQL failure
        raise HTTPException(502, f"database error: {type(e).__name__}")


@app.get("/api/health")
def health():
    _db_call(db.probe_columns)
    return {"ok": True}


@app.post("/api/events")
def post_events(batch: EventBatch):
    now = datetime.now(timezone.utc)
    rows = []
    for e in batch.events:
        row = e.model_dump()
        t = row["time"]
        # trust the client's clock only within a sane window; otherwise stamp with the server's
        row["time"] = t if t and abs((now - t.astimezone(timezone.utc)).total_seconds()) < 86_400 else now
        row["session_id"] = str(batch.session_id) if batch.session_id else None
        rows.append(row)
    n = _db_call(db.insert_events, str(batch.player_id), rows)
    return {"stored": n}


@app.get("/api/players/{player_id}/recall")
def get_recall(player_id: UUID, top_n: int = 3):
    rows = _db_call(db.recent_probes, str(player_id))
    result = compute_weak_spots(rows, top_n=max(1, min(top_n, 10)))
    result["mistakes"] = _db_call(db.player_mistakes, str(player_id))
    return result


@app.get("/api/community")
def get_community():
    return {"hotspots": _db_call(db.community_stats)}
