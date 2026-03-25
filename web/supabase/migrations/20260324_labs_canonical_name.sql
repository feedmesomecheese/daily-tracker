-- Add canonical_name to lab_results for cross-lab test normalization
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS canonical_name text;
