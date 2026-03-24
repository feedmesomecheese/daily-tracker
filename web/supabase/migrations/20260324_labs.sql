-- Lab visits: one row per blood draw / lab visit
CREATE TABLE IF NOT EXISTS lab_visits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visit_date  DATE NOT NULL,
  lab_name    TEXT,
  provider    TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lab_visits_owner      ON lab_visits(owner_id);
CREATE INDEX idx_lab_visits_owner_date ON lab_visits(owner_id, visit_date DESC);

ALTER TABLE lab_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own lab visits" ON lab_visits
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Lab results: individual test results per visit
CREATE TABLE IF NOT EXISTS lab_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id    UUID NOT NULL REFERENCES lab_visits(id) ON DELETE CASCADE,
  test_name   TEXT NOT NULL,
  category    TEXT,   -- CBC, Metabolic, Lipid, Thyroid, Hormone, Vitamin, Other
  value       DECIMAL,
  unit        TEXT,
  ref_low     DECIMAL,
  ref_high    DECIMAL,
  ref_text    TEXT,   -- e.g. "Negative" or ">0.1" for non-numeric ranges
  in_range    BOOLEAN,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lab_results_visit     ON lab_results(visit_id);
CREATE INDEX idx_lab_results_test_name ON lab_results(test_name);

ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
-- RLS via join to lab_visits
CREATE POLICY "Users manage own lab results" ON lab_results
  USING (
    EXISTS (
      SELECT 1 FROM lab_visits v
      WHERE v.id = lab_results.visit_id AND v.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lab_visits v
      WHERE v.id = lab_results.visit_id AND v.owner_id = auth.uid()
    )
  );
