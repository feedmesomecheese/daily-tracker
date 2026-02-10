# Workout Module Plan

## Current System Analysis

**Data Overview:**
- 21,893 entries from January 2008 to present (17+ years)
- Stored in Excel (.xlsm) with macros and UserForm GUI

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

**Exercise Library Categories (Current):**
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

---

## Requirements (From User Input)

### 1. Workout Entry Flow
- **Primary**: Log after workouts on laptop/desktop
- **Secondary**: Ability to log set-by-set on mobile during workout
- Both interfaces should be supported

### 2. Sets Structure
- **Flexible**: No limit on number of sets (currently 5, but may change)
- Variable sets per exercise

### 3. Exercise Categories & Templates
- Keep powerlifting structure: Main S/B/DL days + Accessories for each
- Exercises can belong to multiple categories (e.g., accessory used on both squat and bench days)
- **Future**: User-definable categories for other splits (upper/lower, push/pull/legs, etc.)
- Start with predefined powerlifting categories, allow customization later

### 4. PR & Max Tracking
- **1RM PRs**: Primary PR type to track
- **Max Out / Cycle Max**: Track current cycle maxes (may not be PRs but show progression)
- **Missed Attempts**: Mark attempts that were missed (currently 0 reps with weight)
- Option to flag a lift as "local max" or "cycle max"
- Future: Add 3RM, 5RM, volume PRs

### 5. Cardio & HIIT Tracking
**HIIT Air Bike:**
- Rounds
- Time on (seconds or minutes)
- Time off (seconds or minutes)
- Pedal cycles per "on" interval

**Zone 2 Cardio:**
- Duration
- Type (walk, bike, etc.)
- Notes

### 6. Daily Tracker Integration
- Auto-populate Daily Tracker checkboxes based on workout type:
  - Lift exercise → check "Lift" checkbox
  - HIIT → check "HIIT" checkbox
  - Zone 2 → check "Zone 2" checkbox
  - Tennis → check "Tennis" checkbox
- Keep checkboxes visible for now for transparency
- Future: Consider removing redundant manual entry

### 7. Data Import & Cleanup
**Cleanup needed before import:**
- Separate tennis/other activities from lifting entries
- Separate notes for activities from lifting notes (challenging)
- TBD: Specific format requirements

**Questions for cleanup:**
- What delimiter/format should activities use?
- How to handle mixed notes?

### 8. Exercise Modifiers
- Exercises can have modifiers: banded, reverse band, raised heel, pause, tempo, etc.
- Modifiers combine into exercise name with consistent adjective order
- Example: "Banded Raised Heel Squats" (banded always before raised heel)
- Modifiers are checkboxes/toggles in the UI
- Modifier order is predefined for consistency

### 9. Timers
**Workout Timer:**
- Start/stop button for overall workout
- Tracks: start time, stop time, duration
- Runs continuously during workout

**HIIT/Interval Timer:**
- Configurable work/rest intervals
- Rounds counter
- Audible alarms when intervals change
- Save timer presets (e.g., "30s on / 30s off x 10 rounds")
- Can also use for rest between lifting sets
- Runs alongside (or integrated with) workout timer

**Screen Wake Lock:**
- Keep screen on while timer is active
- Use Screen Wake Lock API

### 10. Previous Workout Card
- Quick access to see last workout for comparison
- Shows: exercises, sets/reps/weight, HIIT info, notes
- Filterable by workout type or exercise

### 11. UI/UX Goals
- Modern, intuitive interface
- Mobile-first for during-workout use
- Desktop-optimized for post-workout logging
- Clean data entry with minimal friction

---

## Proposed Database Schema

### Tables

```sql
-- User-definable exercise categories
exercise_categories (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES auth.users,
  name TEXT NOT NULL,                    -- "Main Squat", "Bench Accessories", etc.
  short_code TEXT,                       -- "S", "BA", "DL", etc.
  color TEXT,                            -- For UI display
  sort_order INTEGER,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ
)

-- Exercise modifiers (banded, pause, tempo, etc.)
exercise_modifiers (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES auth.users,
  name TEXT NOT NULL,                    -- "Banded", "Reverse Band", "Raised Heel"
  adjective_order INTEGER,               -- For consistent naming: 1=banded, 2=reverse band, 3=raised heel
  created_at TIMESTAMPTZ
)

-- Exercise library
exercises (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES auth.users,
  name TEXT NOT NULL,                    -- Base name: "Squats", "Bench Press"
  exercise_type TEXT NOT NULL,           -- 'weighted', 'bodyweight', 'cardio_hiit', 'cardio_zone2', 'sport'
  counts_toward_volume BOOLEAN DEFAULT true,
  category_ids UUID[],                   -- Can belong to multiple categories
  available_modifiers UUID[],            -- Which modifiers apply to this exercise
  muscle_groups TEXT[],                  -- Optional: for future analysis
  aliases TEXT[],                        -- "CGBP" = "Close Grip Bench Press"
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ
)

-- Workouts (one per session)
workouts (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES auth.users,
  date DATE NOT NULL,
  workout_type TEXT,                     -- 'squat_day', 'bench_day', 'deadlift_day', 'cardio', etc.
  location TEXT,
  started_at TIMESTAMPTZ,                -- Timer start
  ended_at TIMESTAMPTZ,                  -- Timer end
  duration_minutes INTEGER,              -- Calculated or manual
  body_weight DECIMAL(5,2),
  body_fat_pct DECIMAL(4,1),
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Individual sets within a workout
workout_sets (
  id UUID PRIMARY KEY,
  workout_id UUID REFERENCES workouts ON DELETE CASCADE,
  exercise_id UUID REFERENCES exercises,
  exercise_name_display TEXT,            -- Full name with modifiers: "Banded Raised Heel Squats"
  modifier_ids UUID[],                   -- Which modifiers were applied
  set_order INTEGER,                     -- Order within the workout
  set_number INTEGER,                    -- Set number for this exercise (1, 2, 3...)
  set_type TEXT DEFAULT 'working',       -- 'warmup', 'working', 'backoff', 'amrap'
  reps INTEGER,
  weight DECIMAL(6,2),
  rpe DECIMAL(3,1),                      -- Rate of Perceived Exertion (optional)
  is_pr BOOLEAN DEFAULT false,           -- Was this a PR?
  is_cycle_max BOOLEAN DEFAULT false,    -- Is this a cycle max (not necessarily PR)?
  is_missed BOOLEAN DEFAULT false,       -- Missed attempt (0 reps logged separately)
  notes TEXT,
  created_at TIMESTAMPTZ
)

-- HIIT sessions (can be part of a workout or standalone)
hiit_sessions (
  id UUID PRIMARY KEY,
  workout_id UUID REFERENCES workouts ON DELETE CASCADE,
  exercise_id UUID REFERENCES exercises, -- e.g., "Air Bike HIIT"
  rounds INTEGER,
  time_on_seconds INTEGER,               -- Work interval
  time_off_seconds INTEGER,              -- Rest interval
  cycles_per_round INTEGER[],            -- Pedal cycles for each round
  total_cycles INTEGER,                  -- Sum of all cycles
  notes TEXT,
  created_at TIMESTAMPTZ
)

-- Zone 2 / steady-state cardio
cardio_sessions (
  id UUID PRIMARY KEY,
  workout_id UUID REFERENCES workouts ON DELETE CASCADE,
  exercise_id UUID REFERENCES exercises, -- e.g., "Zone 2 Walk", "Zone 2 Bike"
  duration_minutes INTEGER,
  distance DECIMAL(6,2),                 -- Optional
  distance_unit TEXT,                    -- 'miles', 'km'
  avg_heart_rate INTEGER,                -- Optional
  notes TEXT,
  created_at TIMESTAMPTZ
)

-- Sport/activity sessions (tennis, climbing, etc.)
activity_sessions (
  id UUID PRIMARY KEY,
  workout_id UUID REFERENCES workouts ON DELETE CASCADE,
  activity_type TEXT NOT NULL,           -- 'tennis', 'climbing', 'basketball', etc.
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ
)

-- Personal records
personal_records (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES auth.users,
  exercise_id UUID REFERENCES exercises,
  pr_type TEXT DEFAULT '1rm',            -- '1rm', '3rm', '5rm', 'volume'
  weight DECIMAL(6,2),
  reps INTEGER,
  estimated_1rm DECIMAL(6,2),            -- Calculated
  achieved_at DATE,
  workout_id UUID REFERENCES workouts,
  set_id UUID REFERENCES workout_sets,
  notes TEXT,
  created_at TIMESTAMPTZ
)

-- Saved timer presets
timer_presets (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES auth.users,
  name TEXT NOT NULL,                    -- "HIIT 30/30 x 10", "Rest Timer 90s"
  timer_type TEXT,                       -- 'hiit', 'rest', 'emom', 'tabata'
  rounds INTEGER,
  work_seconds INTEGER,
  rest_seconds INTEGER,
  warmup_seconds INTEGER,                -- Optional warmup before first round
  cooldown_seconds INTEGER,              -- Optional cooldown after last round
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ
)
```

---

## UI Design Concepts

### Workout Entry Flow

**Step 1: Start Workout**
- Select workout type (Squat Day, Bench Day, DL Day, Cardio, Custom)
- Optional: Start workout timer
- Shows "Last [Type] Workout" card for reference

**Step 2: Add Exercises**
- Search/filter exercises by category or name
- Select exercise → shows modifier toggles if applicable
- Modifiers auto-update display name
- Shows "Last time" data for this exercise

**Step 3: Log Sets**
- For each exercise:
  - Add sets with +/- buttons (not limited to 5)
  - Quick input: reps × weight
  - Optional: RPE, set type (warmup/working)
  - Flag buttons: PR, Cycle Max, Missed
- Running volume total displayed

**Step 4: Add HIIT/Cardio (if applicable)**
- Separate section for HIIT
- Input: rounds, on/off times, cycles per round
- Start HIIT timer or enter manually

**Step 5: Complete Workout**
- Stop workout timer
- Add notes
- Body weight/body fat (optional)
- Review summary
- Save → triggers Daily Tracker integration

### Timer Component
- Floating/dockable timer bar
- States: Workout timer (elapsed) | HIIT timer (rounds/intervals)
- Audible alerts (configurable sounds)
- Screen wake lock toggle
- Minimize to corner when not focused

### Previous Workout Card
- Expandable card showing last workout of same type
- Exercises with sets/reps/weight
- Quick "copy to today" option for exercises

### Stats Dashboard
- Volume trends (daily/weekly/monthly)
- PR history timeline
- Exercise progress charts
- Workout frequency heatmap (reuse calendar-heatmap component)
- Body composition chart

---

## Implementation Phases

### Phase 1: Foundation (MVP)
**Goal**: Basic workout logging that can import existing data

1. Database migrations (all tables)
2. Exercise library CRUD
   - Categories management
   - Exercise modifiers
   - Add/edit/archive exercises
3. Basic workout entry
   - Create workout
   - Add exercises with sets (reps × weight)
   - Save workout
4. Workout history list
5. Import script for Excel data
6. Nav menu integration

**Deliverables**: Can log workouts and view history

### Phase 2: Enhanced Entry
**Goal**: Comfortable daily use

1. Exercise modifiers in UI (combine into display name)
2. "Last workout" / "Last time" cards
3. Previous workout reference while logging
4. Workout timer (start/stop/duration)
5. Missed attempt & cycle max flags
6. PR detection (1RM)
7. Daily Tracker integration (auto-check boxes)

**Deliverables**: Full entry experience matching current Excel workflow

### Phase 3: HIIT & Timers
**Goal**: Complete cardio support

1. HIIT session logging
2. Interval timer with audio alerts
3. Timer presets (save/load)
4. Screen wake lock
5. Zone 2 cardio logging
6. Activity sessions (tennis, etc.)

**Deliverables**: Replace Interval Timer app

### Phase 4: Statistics & Insights
**Goal**: Actionable data visualization

1. Volume trends charts
2. Exercise progress curves
3. PR timeline
4. Workout frequency heatmap
5. Body composition tracking
6. Estimated 1RM calculations

**Deliverables**: Stats dashboard

### Phase 5: Advanced Features
**Goal**: Smart assistance

1. Custom exercise categories
2. Workout templates (save/load workout structures)
3. Progressive overload suggestions
4. More PR types (3RM, 5RM, volume)
5. Muscle group analysis
6. Recovery insights (integrate with Oura/Daily Tracker sleep data)

---

## Data Import Strategy

### Excel → Database Mapping

| Excel Column | Target Table/Column |
|--------------|---------------------|
| Date | workouts.date |
| Location | workouts.location |
| Count As | exercises.counts_toward_volume (x=true, y=false) |
| Lift | exercises.name + workout_sets.exercise_name_display |
| Reps1-5 | workout_sets.reps (create 1-5 rows) |
| Weight1-5 | workout_sets.weight (create 1-5 rows) |
| Total | (calculated, don't import) |
| Volume | (calculated, don't import) |
| Time | workouts.duration_minutes (parse MM:SS) |
| Body Weight | workouts.body_weight |
| Body Fat | workouts.body_fat_pct |
| Other Activities | activity_sessions (need to parse/separate) |
| Notes | workouts.notes or split to exercise notes |

### Import Challenges
1. **Other Activities**: Currently mixed with lifting. Need to:
   - Identify activity rows (tennis, climbing, etc.)
   - Create separate activity_sessions entries
   - May need manual review or pattern matching

2. **Notes**: May contain both workout-level and exercise-level notes
   - Strategy: Import all to workouts.notes initially
   - Future: Allow splitting in UI

3. **Exercise Modifiers**: Current data has full names ("Banded Squats")
   - Strategy: Import as-is to exercise_name_display
   - Create base exercises and link modifiers post-import

4. **HIIT Data**: May be in notes or Other Activities
   - Strategy: Import what's parseable, rest goes to notes

### Pre-Import Cleanup Recommendations
1. Separate activity rows into a separate sheet/section
2. Standardize exercise names (consistent spelling/capitalization)
3. Identify and mark HIIT entries
4. Flag any rows with unusual data for manual review

---

## Technical Notes

### Screen Wake Lock API
```typescript
// Request wake lock
const wakeLock = await navigator.wakeLock.request('screen');

// Release when done
wakeLock.release();
```
- Supported in modern browsers (Chrome, Edge, Safari 16.4+)
- Fallback: Show warning that screen may sleep

### Audio for Timer Alerts
- Use Web Audio API for reliable playback
- Preload sounds on component mount
- Respect device silent mode (show visual fallback)

### Mobile Considerations
- Large touch targets for set entry
- Swipe gestures for quick actions
- Offline support consideration (service worker)
- Haptic feedback on timer events (if available)

---

## Open Questions

1. **Exercise name consistency**: How to handle variations in historical data?
   - "Squats" vs "Squat" vs "Back Squat"
   - Create alias mapping during import?

2. **Modifier order**: Need definitive list of modifiers and their sort order

3. **Activity types**: Full list of sports/activities to support?

4. **Import batching**: 21,893 rows - batch size for import?

5. **Offline mode**: Priority level for Phase 1?
