# Workout Log Display - Future Plans

## #4: Exercise Stats Hover/Click

### Concept
Hover over an exercise name in the workout log to get a quick stats popup, click for deeper analytics via slide-out panel.

### Hover Popup (Quick Stats)
- Last 5 entries for this exercise (date + top set)
- All-time PR (reps x weight)
- Recent trend arrow (up/down/flat based on last 4 weeks)
- Total times performed

### Click-Through (Deep Analytics - Slide Panel)
- Full history table for this exercise (date, sets, tonnage, PRs)
- Volume over time chart (line chart, tonnage per session)
- PR progression chart (max weight over time)
- Set/rep distribution (how often 3x5 vs 5x5, etc.)
- Filter by date range

### Implementation Notes
- **API endpoint**: `GET /api/workouts/exercises/[id]/stats` - returns aggregated data
- **UI**: Popover on hover (lightweight), slide-out panel on click (similar to Sheet component)
- **No infrastructure needed now** - workout_sets already has exercise_id for history queries

---

## #5: Full Workout Log Sheet (Hybrid Approach)

### Concept
A dedicated `/workouts/log` page with a spreadsheet-like view of all workouts. Two view modes:
1. **Workout-centric** (default): One row per workout, expandable to show exercises
2. **Exercise-centric**: Grouped by exercise, showing every individual set

### Workout-Centric View
- Similar layout to `/wide` daily tracker sheet
- Virtualized table (only renders visible rows) for performance
- Columns: Date, Type, Duration, Exercises (summary), Tonnage, Rating, Notes
- Click to expand a row and see full exercise breakdown
- Sort by any column

### Exercise-Centric View
- Group all entries by exercise name
- Columns: Date, Type, each individual set (reps x weight), Tonnage, PR/Max/Miss flags
- Useful for "show me all my Bench Press history"
- Natural feed into charts/analytics (#4)

### Filter Bar (shared by both views)
- Date range picker (preset: last week, last month, last 3 months, custom)
- Workout type dropdown (multi-select)
- Exercise search (autocomplete from exercise library)
- Group filter (e.g., "Bench Work" exercises only)
- Flag filter (show only PRs, show only Maxes)
- Tonnage range (min/max)

### Decisions Made
- **Default data range**: Last 30 days
- **Exercise-centric display**: Show every individual set (not summaries)
- **Charts**: Hover stats popup + detailed stats slide-out panel (not inline sparklines)
- **Compare feature**: Yes, future addition - compare two workout sessions side-by-side
- **Historical data**: Build the view first, import Excel data later (don't let spreadsheet limitations constrain the design)

### Technical Considerations
- **Pagination**: Server-side with limit/offset (existing API already supports this)
- **Virtualization**: Use `@tanstack/react-virtual` or similar for rendering large lists without DOM bloat
- **Data volume**: ~22k historical entries. Loading all at once is impractical. Paginate in chunks of 50-100 with infinite scroll or explicit page controls.
- **Export**: Consider CSV export for the filtered view
- **URL state**: Store filter/view state in URL params so views are shareable/bookmarkable

### Implementation Order
1. Basic `/workouts/log` page with workout-centric table + date range filter
2. Add type and exercise filters
3. Add exercise-centric view toggle
4. Add virtualization for performance
5. Integrate with #4 (click exercise name -> stats slide panel)
6. Add compare feature
7. Add export capability

---

## #6: Exercise Linking (Equivalent Exercises)

### Concept
Allow two or more exercises to be linked as "equivalent" for PR/stats purposes. Example: "Raised Heel Squats" and "Squats" are linked, so their combined history is used for PR detection and analytics.

### Design Direction
- Parameterized, not a one-off hack - any exercises can be linked
- Likely implementation: `equivalent_exercise_ids UUID[]` on exercises table, or a separate `exercise_links` table
- Stats/PR queries would union data across all linked exercises
- UI: configuration in exercise library (link/unlink exercises)

### Status: Future - no architecture impact on log page

---

## #7: Auto-PR Detection

### Concept
The app automatically determines PRs instead of relying solely on manual flagging during input. When a set is saved, check if it's the highest weight ever recorded for that exercise (or linked exercise group from #6).

### Design Direction
- Run at save time: compare new set's weight against max historical weight for that exercise
- Could also flag on display (compute on read) for historical data
- Previous PRs that have been surpassed should optionally lose their PR flag (or keep it as "was a PR at the time")
- Respects exercise linking (#6) - PR is across the linked group

### Status: Future - no architecture impact on log page

---

## #8: Intensity Tracking (% of Cycle Max)

### Concept
Display intensity as a percentage: `set weight / cycle max weight` for that exercise. Provides at-a-glance sense of how heavy a set was relative to the training cycle's peak.

### Design Direction
- Cycle max is already flagged via `is_cycle_max` on workout_sets
- Intensity = `(set weight / most recent cycle max weight) * 100`
- Display as subtle percentage next to set, or color gradient (lighter = lower intensity, darker = higher)
- Name TBD - "Intensity" works, could also be "Effort %" or "% Max"
- Only meaningful for strength exercises

### Status: Future - no architecture impact on log page
