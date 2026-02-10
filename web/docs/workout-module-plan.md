# Workout Module Plan

## Current System Analysis

**Data Overview:**
- 21,893 entries from January 2008 to present (17+ years)
- Stored in Excel (.xlsm) with macros

**Current Columns:**
| Column | Description |
|--------|-------------|
| Date | Workout date |
| Location | Where (e.g., GARAGE) |
| Count As | `x` = weighted (counts toward volume), `y` = bodyweight/cardio |
| Lift | Exercise name |
| Reps1-5, Weight1-5 | Up to 5 sets with reps and weight |
| Total | Total reps for the exercise |
| Volume | Total volume (reps × weight) |
| Time | Workout duration (MM:SS) |
| Body Weight | Current body weight |
| Body Fat | Body fat percentage |
| Other Activities | Non-lifting activities (tennis, rock climbing, etc.) |
| Notes | Detailed workout notes |
| # | Row number |
| LBM | Lean Body Mass (calculated) |
| Chub | Body fat mass (calculated) |

**Exercise Library Categories:**
- Bench Day (B TYPE) - main bench movements
- Bench Accessories (BA TYPE)
- Squat Day (S TYPE) - main squat movements
- Squat Accessories (SA TYPE)
- Deadlift Day (DL TYPE) - main deadlift movements
- DL Accessories (DLA TYPE)
- Other Accessories (OA TYPE)
- Morning Workout (MW Type)
- Archived Exercises

**Exercise Types:**
- `x` = weighted exercise (counts toward volume calculation)
- `y` = bodyweight/cardio (doesn't count toward volume)

**Current Workout Structure:**
- Powerlifting-focused: Bench/Squat/Deadlift days with accessories
- Current lifts: Bench ~295, Squat ~415, Deadlift ~455
- Morning workouts before breakfast
- Mix of lifting and cardio (HIIT air bike, ruck walks, incline walks)
- KOT (Knees Over Toes) mobility work
- Tennis as a sport activity

---

## Proposed Module Features

### 1. Exercise Library
- Categories with parent/child structure
- Exercise type (weighted/bodyweight/cardio/timed)
- Custom exercises + pre-built library
- Archive functionality
- Exercise aliases (e.g., "CGBP" = "Close Grip Bench Press")
- Muscle group tagging

### 2. Workout Logging
- Variable sets per exercise (not fixed at 5)
- Warmup sets vs working sets distinction
- RPE (Rate of Perceived Exertion) per set
- Auto-suggest weight based on recent history
- Show "last time" data while logging
- Rest timer between sets
- Superset/circuit grouping

### 3. Workout Templates
- Save workout structures (Bench Day, Squat Day, etc.)
- One-tap to load a template
- Template variations (heavy day vs volume day)
- Reorder exercises within template

### 4. Body Metrics
- Body weight, body fat %
- Auto-calculate LBM, FFMI
- Integration with Daily Tracker metrics
- Optional Oura integration

### 5. Statistics & Charts
- Volume trends (daily/weekly/monthly/yearly)
- Exercise-specific progress curves
- PR tracking with celebrations
- Body composition over time
- Workout frequency heatmap
- Muscle group balance analysis
- Estimated 1RM calculations (Epley, Brzycki, etc.)

### 6. Smart Features
- PR detection and history
- Progressive overload suggestions
- Fatigue/recovery indicators
- Workout consistency streaks
- Compare to previous week/month/year

### 7. Other Activities
- Non-lifting activities (tennis, climbing, basketball, etc.)
- Duration and notes
- Calendar integration

### 8. Import
- Bring in all 21,893 existing entries
- Map Excel columns to new schema
- Handle edge cases and data cleanup

---

## Questions to Answer Before Implementation

1. **Workout Entry Flow**: Log during workout (set by set) or after? Mobile or desktop primary?

2. **Sets Structure**: Flexibility beyond 5 sets? Warmup sets tracked separately?

3. **Templates**: How rigid are workout days? Same exercises each Bench Day, or mix it up?

4. **PRs**: How to define PRs? (1RM, 3RM, 5RM, volume PR, etc.)

5. **Cardio Tracking**: For HIIT/air bike, what metrics matter? (rounds, work/rest intervals, heart rate zones?)

6. **Integration**: Connect workouts to Daily Tracker metrics (sleep, HRV, etc.) for recovery insights?

7. **Historical Data**: Any cleanup needed on Excel data before import?

8. **Missing Features**: What does current Excel lack?

---

## Proposed Database Schema (Draft)

### Tables

```
exercises
- id
- owner_id
- name
- category (bench, squat, deadlift, accessories, cardio, etc.)
- type (weighted, bodyweight, cardio, timed)
- muscle_groups (array)
- aliases (array)
- is_archived
- created_at

workout_templates
- id
- owner_id
- name (e.g., "Bench Day", "Squat Day")
- exercises (ordered list of exercise IDs with default sets/reps)
- created_at

workouts
- id
- owner_id
- date
- location
- template_id (optional)
- duration_minutes
- notes
- body_weight
- body_fat_pct
- other_activities
- created_at

workout_sets
- id
- workout_id
- exercise_id
- set_number
- set_type (warmup, working)
- reps
- weight
- rpe (optional)
- notes (optional)
- created_at

personal_records
- id
- owner_id
- exercise_id
- pr_type (1rm, 3rm, 5rm, volume, etc.)
- value
- achieved_at
- workout_id

body_metrics (may use existing daily_log or separate)
- id
- owner_id
- date
- weight
- body_fat_pct
- lbm (calculated)
```

---

## UI Mockup Ideas

### Workout Entry Screen
- Select template or start blank
- Add exercises from library (searchable)
- For each exercise:
  - Show last performance
  - Add sets with +/- buttons
  - Reps and weight inputs
  - RPE optional
- Running total volume display
- Rest timer
- Notes field
- Save/complete workout

### Exercise Library Screen
- Categories as tabs or accordion
- Search/filter
- Add new exercise
- Edit/archive existing
- Show exercise history when tapped

### Stats Dashboard
- Volume chart (weekly/monthly)
- PR list with dates
- Body composition chart
- Workout frequency calendar
- Exercise breakdown pie chart

---

## Implementation Phases

### Phase 1: Foundation
- Database schema
- Exercise library CRUD
- Basic workout logging (exercises + sets)
- Import script for existing data

### Phase 2: Core Features
- Workout templates
- Volume calculations
- PR detection
- Basic stats page

### Phase 3: Enhanced UX
- "Last time" display during logging
- Rest timer
- Warmup vs working sets
- RPE tracking

### Phase 4: Advanced Stats
- Progress charts per exercise
- Body composition tracking
- Muscle group analysis
- 1RM estimations

### Phase 5: Smart Features
- Progressive overload suggestions
- Recovery insights (with Daily Tracker integration)
- Workout recommendations

---

## Notes

- This will be a separate module from Daily Tracker (like Books)
- Mobile-first design is important for logging during workouts
- Import existing 17+ years of data is critical
- Consider offline support for gym use
