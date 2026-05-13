-- Explicit grants for Supabase Data API compatibility
--
-- Supabase is removing automatic public schema grants:
--   May 30 2026  → new projects
--   Oct 30 2026  → all existing projects
--
-- This migration:
--   1. Backfills grants on every existing table and view
--   2. Sets ALTER DEFAULT PRIVILEGES so all future tables/views in
--      public schema are covered automatically — no per-migration grants needed

-- ── Backfill: existing tables ─────────────────────────────────────────────────

grant select, insert, update, delete on
  public.achievements,
  public.activity_sessions,
  public.books,
  public.cardio_sessions,
  public.config,
  public.exercise_categories,
  public.exercise_groups,
  public.exercise_modifiers,
  public.exercises,
  public.food_day_template_items,
  public.food_day_template_meals,
  public.food_day_templates,
  public.food_favorites,
  public.food_goals,
  public.food_item_servings,
  public.food_items,
  public.food_log_items,
  public.food_log_meals,
  public.food_logs,
  public.food_meal_template_items,
  public.food_meal_templates,
  public.hiit_sessions,
  public.integration_sync_log,
  public.integrations,
  public.invite_codes,
  public.lab_optimal_overrides,
  public.lab_optimal_ranges,
  public.lab_results,
  public.lab_visits,
  public.log,
  public.metrics,
  public.personal_records,
  public.photos,
  public.timer_presets,
  public.user_achievements,
  public.user_ai_keys,
  public.user_profile,
  public.user_settings,
  public.workout_applied_tags,
  public.workout_exercises,
  public.workout_sets,
  public.workout_tags,
  public.workout_template_exercises,
  public.workout_templates,
  public.workout_types,
  public.workouts
to authenticated, service_role;

-- ── Backfill: existing views (read-only) ─────────────────────────────────────

grant select on
  public.checkbox_lifetime_stats,
  public.checkbox_streak_stats,
  public.ma_simple,
  public.metric_stats_checkbox,
  public.numeric_lifetime_stats,
  public.numeric_recent_stats,
  public.summary_7d
to authenticated, service_role;

-- ── Forward-looking: auto-grant all future tables and views ───────────────────

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant select on sequences to authenticated;

alter default privileges in schema public
  grant select on sequences to service_role;
