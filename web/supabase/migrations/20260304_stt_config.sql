-- Add stt_enabled flag to config table (only meaningful for type = 'text' metrics)
ALTER TABLE config
  ADD COLUMN IF NOT EXISTS stt_enabled boolean NOT NULL DEFAULT false;
