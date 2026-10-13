-- Add quick_add flag to config table (only meaningful for type = 'hhmm' and 'checkbox' metrics).
-- Flagged metrics are listed by GET /api/ai/metrics for the phone quick-add shortcut.
ALTER TABLE config
  ADD COLUMN IF NOT EXISTS quick_add boolean NOT NULL DEFAULT false;
