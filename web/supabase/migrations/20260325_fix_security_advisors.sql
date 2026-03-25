-- Fix Supabase security advisor warnings
-- 1. Enable RLS on achievements (reference/lookup table, no owner_id)
-- 2. Convert SECURITY DEFINER views to SECURITY INVOKER

-- ── achievements table ────────────────────────────────────────────────────────
-- This is a static reference table. All authenticated users may read it.
-- Only service role may insert/update/delete (no user-facing policy needed).
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view achievements" ON achievements;
CREATE POLICY "Authenticated users can view achievements" ON achievements
  FOR SELECT TO authenticated USING (true);

-- ── Security definer views → security invoker ─────────────────────────────────
-- SECURITY DEFINER means the view runs as the view creator (bypassing RLS).
-- SECURITY INVOKER means it runs as the querying user (respects RLS).
-- All these views query tables that already have correct RLS policies,
-- so switching to SECURITY INVOKER is safe.

ALTER VIEW metric_stats_checkbox    SET (security_invoker = on);
ALTER VIEW numeric_lifetime_stats   SET (security_invoker = on);
ALTER VIEW numeric_recent_stats     SET (security_invoker = on);
ALTER VIEW checkbox_streak_stats    SET (security_invoker = on);
ALTER VIEW summary_7d               SET (security_invoker = on);
ALTER VIEW ma_simple                SET (security_invoker = on);
ALTER VIEW checkbox_lifetime_stats  SET (security_invoker = on);
