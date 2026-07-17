# Spec 04 — Workout Module Upgrades

Last updated: 2026-07-17
Status: ⬜ pending
Models: § A **Sonnet 5** · § B **Sonnet 5** · § C **Sonnet 5** · § D **Haiku 4.5**
Depends on: spec-01 Phase B. § D additionally depends on spec-02 and spec-05.

---

## § A — `ExerciseStatsSheet` re-skin (Sonnet 5)

**File:** `src/app/workouts/components/ExerciseStatsSheet.tsx`

1. Top stats (PRs, totals, trend) → `StatTile` row: All-time PR, Tonnage PR,
   Times performed, Trend (existing `tonnageTrend`).
2. Tonnage chart → `TrackerChart`, slot 1, `kind:"area"` (gradient fill).
3. Top-weight / PR progression chart → `TrackerChart`, slot 4, `kind:"line"`.
   Sessions where a PR was set get a visible marker: pass data with a
   `pr` field and render via `activeDot`-style dot (r=4, fill
   `var(--chart-4)`, stroke `var(--background)` 2px) — Recharts `dot`
   accepts a function; only sessions with `pr === true` render a dot.
4. Cardio + intensity charts → same `TrackerChart` conversion, slots 1 and 5.
5. Keep the two-stacked-charts layout; never merge tonnage and weight onto
   one dual-axis chart.

**Verify:** open a strength exercise with PRs and a cardio exercise; both
themes.
**Commit:** `Exercise stats sheet: stat tiles + TrackerChart re-skin`

## § B — Estimated 1RM progression (Sonnet 5)

**Files:** `ExerciseStatsSheet.tsx`, and the stats endpoint
`src/app/api/workouts/exercises/[id]/stats/route.ts` if per-set data isn't
already in the sheet's payload (check first — compute where the set-level
data already lives; do not add a second fetch).

1. Per session, estimated 1RM = `max over working sets of
   weight × (1 + reps / 30)` (Epley). Skip sets with null weight/reps, reps
   0, or `is_missed`. Round to 1 decimal.
2. New chart in the sheet (strength exercises only): "Est. 1RM" —
   `TrackerChart`, slot 2, `kind:"area"`. Mark all-time-high sessions with
   the § A dot treatment.
3. Add an `Est. 1RM` stat tile: current value + delta vs 90 days ago
   (`good: true` when up).
4. Label the chart with a `Hint`/tooltip: "Estimated from best set
   (Epley formula)" — it's an estimate, say so in the UI.

**Verify:** e1RM matches hand-computed value for one known session (e.g.
225×5 → 262.5); missed sets excluded.
**Commit:** `Exercise stats: estimated 1RM progression (Epley)`

## § C — Weekly volume dashboard on `/workouts/log` (Sonnet 5)

**File:** `src/app/workouts/log/page.tsx` (currently ~330 lines — room to
grow; if the section exceeds ~150 lines, extract
`components/WeeklyVolumeSection.tsx`)

A collapsible "Weekly Volume" section above the log list, computed
client-side from the workouts+sets the page already fetches (extend the
fetch range to cover the selected window if needed).

1. Controls: window selector — 8w / 12w / 26w (default 12w).
2. Aggregate per ISO week (Mon-start): total working sets, total tonnage
   (`Σ reps × weight`, strength sets only), workout count.
3. Chart 1 — **Sets per week**, stacked bar by workout *category* (existing
   categories): Recharts `BarChart`, `stackId="a"`, categories assigned to
   slots 1–6 in a fixed order (sorted by category name, so colors are stable
   across window changes); >6 categories fold the rest into "Other"
   (`var(--chart-axis)`). Bars: `radius={[3,3,0,0]}` on the top segment,
   2px gap between stack segments via bar `stroke: var(--background)`,
   `strokeWidth: 1`. Legend below, dot swatches.
4. Chart 2 — **Tonnage per week**, `TrackerChart`, slot 1, area. Rendered as
   its own chart below chart 1 (no dual axis).
5. StatTile row above the charts: This week's sets, 12-week avg sets/week,
   This week's tonnage, Workouts this week — each with delta vs prior week.
6. Tooltip on both charts (reuse `ChartTooltip`), week label formatted
   "Jul 14–20".

**Verify:** week bucketing correct across a month boundary; category colors
stable when switching 8w↔26w; empty weeks render as gaps, not crashes.
**Commit:** `Workout log: weekly volume dashboard`

## § D — Workout consistency heatmap (Haiku 4.5; needs spec-02 + spec-05)

Once spec-05 materializes `workout_done`/`workout_tonnage` into the tracker
`log`, the redesigned `/heatmap` picks workouts up with **zero new UI** —
they appear in the existing metric selector.

Task: verify `workout_done` and `workout_tonnage` appear in the `/heatmap`
metric dropdown and render correctly (tonnage uses the quintile ramp;
workout_done behaves as a checkbox metric). If the heatmap page filters its
metric list (e.g. by group or active flag), adjust the filter so the two
system metrics are included.

**Commit:** `Heatmap: include workout system metrics`
