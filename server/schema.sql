-- Run once in Tiger Cloud (psql or the SQL editor). Safe to re-run.
-- probe_events and hotspot_stats_hourly already exist (the recall queries use them); this only ADDS the columns the
-- game now sends, so mistakes can be stored and the personalised levels can see them. Nothing is dropped or rewritten.

ALTER TABLE probe_events ADD COLUMN IF NOT EXISTS level_id    TEXT;   -- which level the probe happened in
ALTER TABLE probe_events ADD COLUMN IF NOT EXISTS behavior_id TEXT;   -- what the fly actually did
ALTER TABLE probe_events ADD COLUMN IF NOT EXISTS mistake     TEXT;   -- NULL, or why it went wrong: bonk:cheese, soaked:sink, wrong_hotspot, dead_hotspot, half_hearted_song...
ALTER TABLE probe_events ADD COLUMN IF NOT EXISTS session_id  UUID;   -- one page load

CREATE INDEX IF NOT EXISTS probe_events_player_time ON probe_events (player_id, time DESC);
