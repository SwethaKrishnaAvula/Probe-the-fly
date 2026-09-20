-- Probe the Fly: everything the game needs in Tiger Data. Run once in the service's SQL editor (or psql). Safe to re-run.
-- README: "the proposed memory layer records probe events and uses accuracy and response time to shape later challenges".

-- 1. Every hotspot click: one row per probe, with the mistake attached.
CREATE TABLE IF NOT EXISTS probe_events (
  time             TIMESTAMPTZ NOT NULL DEFAULT now(),
  player_id        UUID        NOT NULL,             -- anonymous id from the browser
  session_id       UUID,                             -- one page load
  level_id         TEXT,                             -- level_2_pie, ...
  hotspot_id       TEXT        NOT NULL,             -- turn_right, feed, ... (level-file ids)
  behavior_id      TEXT,                             -- what the fly actually did
  correct          BOOLEAN,                          -- NULL = not scored (discovery level)
  response_ms      INTEGER CHECK (response_ms >= 0), -- click delay after the fly was ready
  notebook_visible BOOLEAN     NOT NULL DEFAULT FALSE,
  mistake          TEXT                              -- NULL, or bonk:cheese, soaked:sink, wrong_hotspot,
);                                                   -- dead_hotspot, half_hearted_song, missed_pie, moved_away

-- If probe_events already existed with fewer columns (the service was set up earlier), the CREATE above skipped it:
-- these add whatever is missing and change nothing else.
ALTER TABLE probe_events ADD COLUMN IF NOT EXISTS session_id  UUID;
ALTER TABLE probe_events ADD COLUMN IF NOT EXISTS level_id    TEXT;
ALTER TABLE probe_events ADD COLUMN IF NOT EXISTS behavior_id TEXT;
ALTER TABLE probe_events ADD COLUMN IF NOT EXISTS mistake     TEXT;

SELECT create_hypertable('probe_events', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS probe_events_player_time ON probe_events (player_id, time DESC);

-- 2. Community stats: hourly roll-up per hotspot (scored, non-notebook probes only, the same rule weak_spot.py uses).
CREATE MATERIALIZED VIEW IF NOT EXISTS hotspot_stats_hourly
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', time)                       AS bucket,
       hotspot_id,
       SUM(CASE WHEN correct THEN 1 ELSE 0 END)::bigint  AS n_correct,
       COUNT(*)                                          AS n_total,
       AVG(response_ms)                                  AS avg_ms
FROM probe_events
WHERE correct IS NOT NULL AND notebook_visible = FALSE
GROUP BY bucket, hotspot_id
WITH NO DATA;

-- include not-yet-refreshed rows, so the community numbers are live
ALTER MATERIALIZED VIEW hotspot_stats_hourly SET (timescaledb.materialized_only = false);

SELECT add_continuous_aggregate_policy('hotspot_stats_hourly',
  start_offset      => INTERVAL '3 days',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '10 minutes',
  if_not_exists     => TRUE);

-- Smoke test (run separately, then delete the row):
--   INSERT INTO probe_events (player_id, hotspot_id, level_id, correct, response_ms)
--   VALUES ('11111111-1111-4111-8111-111111111111', 'turn_right', 'level_2_pie', true, 900);
--   SELECT * FROM probe_events;
--   SELECT * FROM hotspot_stats_hourly;
--   DELETE FROM probe_events WHERE player_id = '11111111-1111-4111-8111-111111111111';
