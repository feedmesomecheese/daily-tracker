CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES auth.users(id),
  max_uses INT DEFAULT 1,
  use_count INT DEFAULT 0
);

ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
-- No public RLS policies — codes are validated server-side via admin client
