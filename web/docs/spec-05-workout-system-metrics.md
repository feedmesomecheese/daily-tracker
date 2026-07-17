# Spec 05 — Workout → Tracker System Metrics

Last updated: 2026-07-17
Status: ⬜ pending
Model: **Opus 4.8** — do NOT hand this to Haiku or Sonnet. It writes to the
`log` table (the tracker's core data store) and must stay correct across
workout create / edit / delete / date-change. Read this whole doc plus the
files listed before writing any code.

**Goal:** materialize two derived metrics into the tracker `log` so every
existing feature (heatmap, insights/correlations, streaks, MAs, radar,
summary) picks up workouts with no per-feature work:

- `workout_done` — checkbox (1 when ≥1 workout exists on that date)
- `workout_tonnage` — number (Σ `reps × weight` over all non-missed strength
  sets across that date's workouts; 0-tonnage days with a workout log `null`
  tonnage, not 0, so cardio-only days don't drag numeric averages)

**Files to read first:**
- `src/app/api/workouts/route.ts` (POST — create)
- `src/app/api/workouts/[id]/route.ts` (PATCH/DELETE)
- `src/app/api/workouts/[id]/sets/route.ts` (set-level edits, if writable)
- `src/app/api/save-log/route.ts` (how log upserts + `recalculateFromDate`
  work today)
- `src/lib/recalculate.ts`

---

## Design rules (non-negotiable)

1. **Recompute-from-source, never increment.** On any workout mutation,
   recompute both metrics for the affected date(s) from a fresh query of
   that user's workouts/sets on those dates, then upsert into `log`. Never
   `+=`. This makes every path idempotent.
2. **Date changes affect two days.** A PATCH that moves a workout's `date`
   must recompute BOTH the old and the new date. Capture the old date before
   updating.
3. **Delete → recompute, possibly to absence.** If a date ends up with no
   workouts: delete the `workout_done` and `workout_tonnage` rows from `log`
   for that date (absence = untracked, consistent with heatmap "no data" —
   do not write 0).
4. **Config rows are auto-provisioned, once.** On first write, ensure
   `config` rows exist for both metrics (per owner): group `"System"`,
   `active: true`, `required: false`, sensible `analytics_config`
   (`workout_done`: direction "increase"; `workout_tonnage`:
   higher_is_better true). Never overwrite an existing config row — the user
   may customize it. Mark them so the UI can distinguish them if needed
   (e.g. a `system: true` key inside `analytics_config`).
5. **The Today entry form must not fight the sync.** Check how `/` builds
   its form (`src/app/page.tsx` uses config rows): system metrics should be
   read-only or hidden in the entry form (recommend: hidden — filter out
   the `System` group in `sortMetricsForForm`'s caller), so a manual save
   can't clobber derived values.
6. **Respect calculated-metric recalcs.** After upserting, call the same
   `recalculateFromDate` path save-log uses, so user formulas referencing
   these metrics update.
7. **Auth/RLS:** all writes go through the same authed Supabase client
   pattern the workout routes already use — owner-scoped, never the admin
   client for user-triggered mutations unless save-log already does so
   (mirror save-log's existing pattern exactly).

## Implementation shape

- New module `src/lib/workoutMetricsSync.ts` exporting
  `syncWorkoutMetrics(supabase, ownerId, dates: string[])` implementing
  rules 1–4 and 6.
- Call it at the end of every successful workout mutation route (create,
  update, delete, and set-level edit routes if they exist), passing the
  affected date(s). Failure to sync must not fail the workout save — log the
  error and return success with a `sync_warning` field.
- **Backfill:** `scripts/backfill-workout-metrics.ts` (run manually with
  tsx, like the existing scripts/): iterate all distinct workout dates for
  the user, call the same sync function. Print a summary (dates processed,
  rows written). Must be safe to re-run (it is, by rule 1).

## Verify (all mandatory before commit)

- [ ] Create a workout → both rows appear in `log` with correct values.
- [ ] Edit a set's reps/weight → tonnage row updates (recomputed, not
      incremented).
- [ ] Move a workout to a different date → old date's rows removed (if now
      empty) and new date's rows created.
- [ ] Delete the only workout on a date → both rows deleted from `log`.
- [ ] Cardio-only workout day → `workout_done` = 1, `workout_tonnage` row
      absent or null (per design rule above — pick one and document it in
      the code).
- [ ] Two workouts on one date → values aggregate across both.
- [ ] Re-running backfill produces zero changes on second run.
- [ ] Today entry form neither shows nor overwrites the system metrics.
- [ ] Heatmap + metric stats sheet render both metrics.

**Commits:** `Add workout system-metric sync to log` ·
`Backfill script for workout system metrics`
