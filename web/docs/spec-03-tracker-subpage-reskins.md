# Spec 03 — Tracker Sub-page Re-skins

Last updated: 2026-07-17
Status: ⬜ pending
Models: § A **Sonnet 5** · § B **Haiku 4.5** · § C **Sonnet 5** · § D **Haiku 4.5**
Depends on: spec-01 Phase B (`TrackerChart`, `StatTile`)

Order within this spec: A → B → C → D. Section A establishes the pattern the
others copy.

---

## § A — `metric-stats-sheet.tsx` re-skin (Sonnet 5)

The drill-down sheet opened from the Today page — highest daily eyeball time
in the app. ~1,700 lines; touch only the presentation layer, keep all data
fetching and state as-is.

1. **Header stat tiles.** Replace the current text-stat block with a
   `StatTile` row: Average (period), Best, Current streak, Trend
   (`delta` prop from the existing trend data — direction + `change_pct`,
   `good` derived from `higher_is_better`/`direction` config).
2. **Main history chart → `TrackerChart`.**
   - Primary series: the metric values, slot 1, `kind:"area"` (gradient fill).
   - MA overlays (when `show_ma`): slot 5, `kind:"line"`, `dashed:true`, one
     per period.
   - Daily goal (when configured with a numeric target): `goal` prop →
     reference line.
   - `yFormatter`: reuse the sheet's existing hhmm/time/number formatting.
3. **Comparison mode** (comparing multiple metrics): series slots assigned in
   fixed order 1→6 by position in the comparison list; legend appears
   automatically at ≥2 series. **Never add a second y-axis** — when the
   compared metric's scale differs by >10×, render it as its own stacked
   `TrackerChart` beneath (two charts, shared x domain), not a dual axis.
4. **`FullWidthSparkline`**: keep, but stroke `var(--chart-1)` and axis
   stroke `var(--chart-axis)` (spec-01 Phase C may have done this already).
5. Remove all remaining chart-related raw hex in this file.

**Verify:** open a numeric metric, an hhmm metric, a checkbox metric, and a
comparison view — light + dark. Goal line renders where configured.
**Commit:** `Metric stats sheet: stat tiles + TrackerChart re-skin`

## § B — `/metrics` page charts (Haiku 4.5)

`src/app/metrics/page.tsx` (~2,300 lines). Mechanical: replace each inline
Recharts block with `TrackerChart`, mapping existing series/props onto the
`TrackerChartProps` shape established in § A (copy the § A usage as the
reference). No layout or data changes. If any chart in the file doesn't map
cleanly onto `TrackerChart`, leave that chart untouched and list it in the
commit message rather than improvising.

**Verify:** every chart on /metrics renders with data; both themes.
**Commit:** `Metrics page: charts on TrackerChart`

## § C — `/summary` metric cards (Sonnet 5)

**Files:** `src/components/summary/metric-summary-card.tsx`,
`src/app/api/summary/route.ts`

The period cards are text-only. Add per-metric visual context:

1. **API:** extend each metric entry in the summary response with
   `series: number[]` — the metric's daily values across the period, in date
   order, `null`-gaps filtered out. The route already queries the log rows to
   compute aggregates; emit the series from the same data (no extra query).
2. **Card:** right-align a sparkline (the `StatTile` spark pattern: 64×20
   SVG polyline, `var(--chart-1)`, strokeWidth 1.5) when `series.length >= 3`.
3. **Delta vs previous period:** the response already contains
   previous-period comparison — render it as the arrow-badge treatment from
   `StatTile.delta` (arrow glyph + %, colored by good/bad using the metric's
   `higher_is_better` config, gray when flat/unknown).

**Verify:** /summary for week + month periods; cards with sparse data (<3
points) show no sparkline; deltas colored correctly for a
"lower-is-better" metric.
**Commit:** `Summary cards: sparklines + delta badges`

## § D — Retire `/ma` (Haiku 4.5)

The standalone moving-average page is redundant once § A ships MA overlays.

1. Delete `src/app/ma/page.tsx` (the `/api/ma` route stays — the stats sheet
   may consume it).
2. Remove the `/ma` entry from `modules` in `src/components/nav-menu.tsx`
   if present (check; it may not be linked).
3. `npm run build` must pass (catches dangling imports).

**Commit:** `Remove standalone /ma page (superseded by stats-sheet MA overlays)`
