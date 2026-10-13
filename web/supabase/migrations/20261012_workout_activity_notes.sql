-- Parsed activity notes (tennis first)
--
-- Purely additive. This migration creates one new table and touches nothing
-- else. In particular it never writes to `workouts`: the raw note in
-- workouts.notes stays the single source of truth, and every row here is
-- derived from it. Rolling back is `DROP TABLE workout_activity_notes`.
--
-- One row per (workout, activity). The parse lifecycle lives on THIS table,
-- not on workouts, so the workouts table is never UPDATEd by this feature.

CREATE TABLE IF NOT EXISTS workout_activity_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity TEXT NOT NULL DEFAULT 'tennis',

  -- ── Parse lifecycle ────────────────────────────────────────────────────────
  -- 'pending' is written when a workout note is saved; the parser claims it,
  -- then moves it to 'parsed' (or 'failed' with parse_error, or 'skipped'
  -- when the note has no content for this activity).
  status TEXT NOT NULL DEFAULT 'pending',
  parse_error TEXT,
  parsed_at TIMESTAMPTZ,

  -- Idempotent re-parse: a row is stale when the note text changed
  -- (raw_note_hash) or the contract changed (prompt_version).
  raw_note_hash TEXT NOT NULL,
  prompt_version INTEGER,
  parser TEXT,  -- 'in-session', 'cron:claude-opus-5-5', etc.

  -- ── Provenance ─────────────────────────────────────────────────────────────
  -- source_excerpt is a VERBATIM substring of workouts.notes: the span of the
  -- note this parse was taken from. mixed_note is true when the note also
  -- covers a lift. is_activity_session is false for a passing reference
  -- ("left early b/c I had a tennis match") that is not a session.
  source_excerpt TEXT,
  mixed_note BOOLEAN NOT NULL DEFAULT false,
  is_activity_session BOOLEAN NOT NULL DEFAULT true,

  -- 31 historical sessions were logged as two workout rows (a lift row whose
  -- note also covers tennis, and a second row holding the tennis text again).
  -- The parse attaches to the non-lift row and points at its sibling, so
  -- aggregates count the session once but either workout can reach the parse.
  duplicate_of_workout_id UUID REFERENCES workouts(id) ON DELETE SET NULL,

  -- ── Session facts ──────────────────────────────────────────────────────────
  confidence TEXT,
  result TEXT,
  score TEXT,
  format TEXT,
  league TEXT,
  surface TEXT,
  partner TEXT,
  opponent TEXT,

  -- ── Sections ───────────────────────────────────────────────────────────────
  -- {section_key: text}. Deliberately schemaless: the authoritative list and
  -- display order live in SECTION_KEYS in src/lib/tennis/parse-contract.ts, and
  -- duplicating them as columns here would give them a second home to drift
  -- from. A different activity brings its own keys without a migration.
  --
  -- Only non-null sections are stored, so `sections ? 'serves'` is the test for
  -- "this session has serve notes".
  --
  -- Not a partition: a sentence covering two strokes appears in both sections.
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One parse per workout per activity. Also the conflict target that makes
-- re-parsing an upsert instead of a duplicate insert.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workout_activity_notes_workout_activity_key'
      AND conrelid = 'public.workout_activity_notes'::regclass
  ) THEN
    ALTER TABLE workout_activity_notes
      ADD CONSTRAINT workout_activity_notes_workout_activity_key
      UNIQUE (workout_id, activity);
  END IF;
END $$;

-- Value constraints. Written as NULL-permissive so a 'pending' row can exist
-- before anything has been parsed into it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_activity_notes_status_check') THEN
    ALTER TABLE workout_activity_notes ADD CONSTRAINT workout_activity_notes_status_check
      CHECK (status IN ('pending', 'parsed', 'skipped', 'failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_activity_notes_result_check') THEN
    ALTER TABLE workout_activity_notes ADD CONSTRAINT workout_activity_notes_result_check
      CHECK (result IS NULL OR result IN ('win', 'loss', 'split', 'practice', 'unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_activity_notes_format_check') THEN
    ALTER TABLE workout_activity_notes ADD CONSTRAINT workout_activity_notes_format_check
      CHECK (format IS NULL OR format IN ('singles', 'doubles', 'unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_activity_notes_surface_check') THEN
    ALTER TABLE workout_activity_notes ADD CONSTRAINT workout_activity_notes_surface_check
      CHECK (surface IS NULL OR surface IN ('hard', 'clay', 'grass', 'indoor', 'unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_activity_notes_confidence_check') THEN
    ALTER TABLE workout_activity_notes ADD CONSTRAINT workout_activity_notes_confidence_check
      CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low'));
  END IF;
  -- sections must be a JSON object, never an array or scalar. The key set is
  -- NOT constrained here on purpose: that belongs to the parse contract, and
  -- pinning tennis section names into the schema is exactly what JSONB avoids.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_activity_notes_sections_object_check') THEN
    ALTER TABLE workout_activity_notes ADD CONSTRAINT workout_activity_notes_sections_object_check
      CHECK (jsonb_typeof(sections) = 'object');
  END IF;
  -- A parsed row must record which contract produced it.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_activity_notes_parsed_check') THEN
    ALTER TABLE workout_activity_notes ADD CONSTRAINT workout_activity_notes_parsed_check
      CHECK (status <> 'parsed' OR (prompt_version IS NOT NULL AND parsed_at IS NOT NULL));
  END IF;
END $$;

-- Foreign keys are not indexed automatically; both are joined on.
CREATE INDEX IF NOT EXISTS idx_workout_activity_notes_workout
  ON workout_activity_notes(workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_activity_notes_owner
  ON workout_activity_notes(owner_id);
CREATE INDEX IF NOT EXISTS idx_workout_activity_notes_dupe
  ON workout_activity_notes(duplicate_of_workout_id);

-- The cron worker's only query: "what still needs parsing?" Partial index so
-- it stays tiny no matter how many parsed rows accumulate.
CREATE INDEX IF NOT EXISTS idx_workout_activity_notes_pending
  ON workout_activity_notes(owner_id, created_at)
  WHERE status = 'pending';

-- Which sections a session has ("show me every note that mentions lobs").
-- Default jsonb_ops, not jsonb_path_ops: the smaller jsonb_path_ops opclass
-- does not support the `?` key-existence operator, which is the query here.
CREATE INDEX IF NOT EXISTS idx_workout_activity_notes_sections
  ON workout_activity_notes USING GIN (sections);

-- Aggregate reads ("my record this year") hit owner + activity.
CREATE INDEX IF NOT EXISTS idx_workout_activity_notes_owner_activity
  ON workout_activity_notes(owner_id, activity);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Policy shape matches the rest of the workouts module (20260210_workouts.sql).
-- service_role bypasses RLS, which is how the cron parser writes.
ALTER TABLE workout_activity_notes ENABLE ROW LEVEL SECURITY;

-- Created only if absent, rather than DROP + CREATE. Same idempotency, but no
-- destructive statement: a DROP POLICY here would briefly remove protection
-- from a populated table on any re-run, and tooling rightly treats it as such.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workout_activity_notes'
                 AND policyname = 'Users can view own workout_activity_notes') THEN
    CREATE POLICY "Users can view own workout_activity_notes" ON workout_activity_notes
      FOR SELECT USING (auth.uid() = owner_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workout_activity_notes'
                 AND policyname = 'Users can insert own workout_activity_notes') THEN
    CREATE POLICY "Users can insert own workout_activity_notes" ON workout_activity_notes
      FOR INSERT WITH CHECK (auth.uid() = owner_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workout_activity_notes'
                 AND policyname = 'Users can update own workout_activity_notes') THEN
    CREATE POLICY "Users can update own workout_activity_notes" ON workout_activity_notes
      FOR UPDATE USING (auth.uid() = owner_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workout_activity_notes'
                 AND policyname = 'Users can delete own workout_activity_notes') THEN
    CREATE POLICY "Users can delete own workout_activity_notes" ON workout_activity_notes
      FOR DELETE USING (auth.uid() = owner_id);
  END IF;
END $$;

-- 20260513_explicit_grants.sql sets ALTER DEFAULT PRIVILEGES for future tables,
-- so this is belt-and-braces in case this migration runs as a different role.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_activity_notes
  TO authenticated, service_role;
