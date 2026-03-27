-- lab_optimal_ranges: system-wide seeded optimal ranges (readable by all authenticated users)
CREATE TABLE IF NOT EXISTS lab_optimal_ranges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL,
  opt_low DECIMAL,
  opt_high DECIMAL,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  age_min INTEGER,
  age_max INTEGER,
  source_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE lab_optimal_ranges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read optimal ranges"
  ON lab_optimal_ranges FOR SELECT TO authenticated USING (true);

-- lab_optimal_overrides: per-user custom overrides
CREATE TABLE IF NOT EXISTS lab_optimal_overrides (
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canonical_name TEXT NOT NULL,
  opt_low DECIMAL,
  opt_high DECIMAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, canonical_name)
);

ALTER TABLE lab_optimal_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own overrides"
  ON lab_optimal_overrides FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- ── Seed data ────────────────────────────────────────────────────────────────
-- canonical_name stored lowercase to match panel API grouping key
-- Multiple rows per name handle gender/age specificity;
-- most-specific match wins (gender + age > gender-only > universal)

INSERT INTO lab_optimal_ranges (canonical_name, opt_low, opt_high, gender, age_min, age_max, source_note) VALUES

-- Lipids / Cardiovascular
('ldl cholesterol',          NULL,   70,    NULL,     NULL, NULL, 'Cardiovascular longevity optimal'),
('ldl',                      NULL,   70,    NULL,     NULL, NULL, 'Cardiovascular longevity optimal'),
('hdl cholesterol',           60,   NULL,   'male',   NULL, NULL, 'Cardiovascular optimal'),
('hdl cholesterol',           70,   NULL,   'female', NULL, NULL, 'Cardiovascular optimal'),
('hdl',                       60,   NULL,   'male',   NULL, NULL, 'Cardiovascular optimal'),
('hdl',                       70,   NULL,   'female', NULL, NULL, 'Cardiovascular optimal'),
('triglycerides',            NULL,   80,    NULL,     NULL, NULL, 'Metabolic optimal'),
('apob',                     NULL,   60,    NULL,     NULL, NULL, 'Cardiovascular longevity'),
('apolipoprotein b',         NULL,   60,    NULL,     NULL, NULL, 'Cardiovascular longevity'),
('hscrp',                    NULL,    0.5,  NULL,     NULL, NULL, 'Inflammation optimal'),
('hs-crp',                   NULL,    0.5,  NULL,     NULL, NULL, 'Inflammation optimal'),
('c-reactive protein, high sensitivity', NULL, 0.5, NULL, NULL, NULL, 'Inflammation optimal'),
('c-reactive protein',       NULL,    0.5,  NULL,     NULL, NULL, 'Inflammation optimal'),

-- Metabolic / Glucose
('glucose',                   72,    85,    NULL,     NULL, NULL, 'Fasting glucose optimal'),
('fasting glucose',           72,    85,    NULL,     NULL, NULL, 'Fasting glucose optimal'),
('hba1c',                    NULL,    5.3,  NULL,     NULL, NULL, 'Glycemic optimal <5.3%'),
('hemoglobin a1c',           NULL,    5.3,  NULL,     NULL, NULL, 'Glycemic optimal <5.3%'),
('insulin',                  NULL,    6,    NULL,     NULL, NULL, 'Fasting insulin optimal uIU/mL'),
('insulin, fasting',         NULL,    6,    NULL,     NULL, NULL, 'Fasting insulin optimal uIU/mL'),
('fasting insulin',          NULL,    6,    NULL,     NULL, NULL, 'Fasting insulin optimal uIU/mL'),

-- Thyroid
('tsh',                        1.0,   2.5,  NULL,     NULL, NULL, 'Thyroid optimal'),
('free t3',                    3.2,   4.2,  NULL,     NULL, NULL, 'Thyroid optimal pg/mL'),
('free t4',                    1.3,   1.8,  NULL,     NULL, NULL, 'Thyroid optimal ng/dL'),
('t3, free',                   3.2,   4.2,  NULL,     NULL, NULL, 'Thyroid optimal pg/mL'),
('t4, free',                   1.3,   1.8,  NULL,     NULL, NULL, 'Thyroid optimal ng/dL'),

-- Hormones
('testosterone total',        500,   800,   'male',   NULL, NULL, 'Longevity/functional medicine ng/dL'),
('testosterone, total',       500,   800,   'male',   NULL, NULL, 'Longevity/functional medicine ng/dL'),
('testosterone total',         50,   150,   'female', NULL, NULL, 'Functional medicine ng/dL'),
('testosterone, total',        50,   150,   'female', NULL, NULL, 'Functional medicine ng/dL'),
('testosterone',              500,   800,   'male',   NULL, NULL, 'Longevity/functional medicine ng/dL'),
('testosterone',               50,   150,   'female', NULL, NULL, 'Functional medicine ng/dL'),
('dhea-s',                    350,   500,   'male',     30,  50,  'ug/dL age 30-50'),
('dhea sulfate',              350,   500,   'male',     30,  50,  'ug/dL age 30-50'),
('dhea-sulfate',              350,   500,   'male',     30,  50,  'ug/dL age 30-50'),
('cortisol',                   10,    18,   NULL,     NULL, NULL, 'Morning cortisol optimal ug/dL'),
('cortisol, am',               10,    18,   NULL,     NULL, NULL, 'Morning cortisol optimal ug/dL'),

-- PSA (age-stratified, male only)
('psa',                       NULL,    1.0,  'male',  NULL,   49, 'Age <50'),
('psa',                       NULL,    2.0,  'male',    50,   70, 'Age 50-70'),
('prostate specific antigen', NULL,    1.0,  'male',  NULL,   49, 'Age <50'),
('prostate specific antigen', NULL,    2.0,  'male',    50,   70, 'Age 50-70'),

-- Vitamins / Nutrients
('vitamin d',                  50,    80,   NULL,     NULL, NULL, 'ng/mL optimal'),
('vitamin d, 25-oh',           50,    80,   NULL,     NULL, NULL, 'ng/mL optimal'),
('25-hydroxyvitamin d',        50,    80,   NULL,     NULL, NULL, 'ng/mL optimal'),
('b12',                       600,  1200,   NULL,     NULL, NULL, 'pmol/L optimal'),
('vitamin b12',               600,  1200,   NULL,     NULL, NULL, 'pmol/L optimal'),
('cobalamin',                 600,  1200,   NULL,     NULL, NULL, 'pmol/L optimal'),
('folate',                     15,   NULL,  NULL,     NULL, NULL, 'ng/mL optimal'),
('folic acid',                 15,   NULL,  NULL,     NULL, NULL, 'ng/mL optimal'),
('magnesium',                   2.0,   2.5, NULL,     NULL, NULL, 'mg/dL optimal'),
('zinc',                       90,   120,   NULL,     NULL, NULL, 'ug/dL optimal'),
('homocysteine',              NULL,    8,   NULL,     NULL, NULL, 'umol/L optimal'),

-- Liver enzymes
('alt',                       NULL,   25,   'male',   NULL, NULL, 'IU/L tighter than standard ref'),
('alt',                       NULL,   20,   'female', NULL, NULL, 'IU/L tighter than standard ref'),
('alanine aminotransferase',  NULL,   25,   'male',   NULL, NULL, 'IU/L optimal'),
('alanine aminotransferase',  NULL,   20,   'female', NULL, NULL, 'IU/L optimal'),
('alanine transaminase',      NULL,   25,   'male',   NULL, NULL, 'IU/L optimal'),
('alanine transaminase',      NULL,   20,   'female', NULL, NULL, 'IU/L optimal'),
('ast',                       NULL,   25,   NULL,     NULL, NULL, 'IU/L optimal'),
('aspartate aminotransferase',NULL,   25,   NULL,     NULL, NULL, 'IU/L optimal'),
('ggt',                       NULL,   20,   NULL,     NULL, NULL, 'IU/L optimal'),
('gamma-glutamyl transferase',NULL,   20,   NULL,     NULL, NULL, 'IU/L optimal'),
('gamma glutamyl transferase',NULL,   20,   NULL,     NULL, NULL, 'IU/L optimal'),

-- Kidney / Metabolic markers
('uric acid',                   3.5,   5.5, 'male',   NULL, NULL, 'mg/dL optimal'),
('uric acid',                   2.5,   4.5, 'female', NULL, NULL, 'mg/dL optimal'),
('creatinine',                  0.9,   1.1, 'male',   NULL, NULL, 'mg/dL optimal'),
('egfr',                       90,   NULL,  NULL,     NULL, NULL, '>90 optimal mL/min/1.73m²'),
('estimated gfr',              90,   NULL,  NULL,     NULL, NULL, '>90 optimal'),

-- Iron / Ferritin
('ferritin',                   50,   150,   'male',   NULL, NULL, 'ng/mL optimal'),
('ferritin',                   30,   100,   'female', NULL, NULL, 'ng/mL optimal'),

-- CBC (tighter than standard reference)
('wbc',                         4.5,   7.0, NULL,     NULL, NULL, 'K/uL tighter than standard ref'),
('white blood cell count',      4.5,   7.0, NULL,     NULL, NULL, 'K/uL tighter than standard ref'),
('white blood cells',           4.5,   7.0, NULL,     NULL, NULL, 'K/uL tighter than standard ref'),
('neutrophils',                40,    60,   NULL,     NULL, NULL, 'Percentage optimal'),
('neutrophils %',              40,    60,   NULL,     NULL, NULL, 'Percentage optimal'),
('lymphocytes',                25,    40,   NULL,     NULL, NULL, 'Percentage optimal'),
('lymphocytes %',              25,    40,   NULL,     NULL, NULL, 'Percentage optimal')
;
