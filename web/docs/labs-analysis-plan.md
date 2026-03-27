# Labs Analysis — Implementation Plan

Last updated: 2026-03-25

---

## Overview

Two-page labs experience:
- `/labs` — existing visit-centric view (keep as-is, add edit capability)
- `/labs/panel` — new test-centric analysis page

---

## Phase 1: Edit Existing Labs

**Goal:** Fix bad data from initial import before building charts.

### LabVisitSheet — Edit Mode

Add an edit toggle to the existing `LabVisitSheet`.

- [ ] Edit visit metadata inline (date, lab name, provider, notes)
- [ ] Edit individual result rows inline (test name, canonical name, category, value, unit, ref_low, ref_high, ref_text, in_range)
  - Same table/inline-edit UI as the upload review step for consistency
- [ ] Add new result row to an existing visit (+ button at bottom of results table)
- [ ] Delete individual result (already exists, keep)
- [ ] Wire to existing PATCH endpoints:
  - `PATCH /api/labs/visits/[id]` — visit metadata
  - `PATCH /api/labs/results/[id]` — individual result
  - `POST /api/labs/visits` used for adding new results? Or new endpoint needed:
    - [ ] `POST /api/labs/visits/[id]/results` — add result to existing visit

---

## Phase 2: User Profile (Gender + Age)

**Goal:** Enable gender/age-aware optimal ranges.

### Database

- [ ] Migration: `user_profile` table
  ```sql
  user_profile (
    owner_id UUID PRIMARY KEY references auth.users,
    gender TEXT CHECK (gender IN ('male', 'female', 'other')),
    birth_year INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
  )
  ```
- [ ] RLS policy (owner can only read/write their own row)
- [ ] API: `GET /api/profile` and `PATCH /api/profile`

### Settings Page

- [ ] Add "Profile" card to `/settings/page.tsx` (above appearance section)
  - Gender selector (Male / Female / Other / Prefer not to say)
  - Birth year input (or year picker)
  - Auto-saves on change (same pattern as rest of settings)

---

## Phase 3: `/labs/panel` — Test List + Filter/Sort + CSV Export

**Goal:** Test-centric view with all unique tests, filters, sorts, and export.

### API

- [ ] `GET /api/labs/panel` — returns all unique tests grouped by canonical_name with:
  ```typescript
  {
    canonical_name: string
    display_name: string          // most common test_name across visits
    category: string
    unit: string
    history: {
      visit_id: string
      visit_date: string          // YYYY-MM-DD
      value: number
      ref_low: number | null
      ref_high: number | null
      ref_text: string | null
      in_range: boolean | null
    }[]
    latest: history[0]            // most recent entry
    trend: "up" | "down" | "stable" | "insufficient_data"
    times_out_of_range: number
    last_tested: string           // YYYY-MM-DD
    visit_count: number
  }[]
  ```
  - Trend computed server-side: compare last 2 values (or slope of last 3)
  - Joined with user_profile for gender/birth_year (needed later for optimal ranges)

### Page: `/labs/panel`

**Layout:**
- Top: filter/sort bar + action buttons (Compare, Export CSV, Manage Tests)
- Main: test card list (grouped by category when no filters active, flat when filtering/searching)
- Selected test: opens right-side detail sheet

**Filter bar (left side):**
- [ ] Search input (test name)
- [ ] Category multi-select (CBC, Metabolic, Lipid, Thyroid, Hormone, Vitamin, Urinalysis, Other)
- [ ] Status filter: All / Out of range / Suboptimal / In optimal range
- [ ] Trending: Any / Up / Down / Stable
- [ ] "Current visit only" toggle — show only tests from the most recent lab visit
- [ ] "Hide stale" toggle — hide tests not done in the last 12 months (configurable threshold?)
- [ ] Date range: tests seen within Last 6mo / 1y / 2y / All time

**Sort (right side of filter bar):**
- Test name (A–Z)
- Most recently tested
- Furthest from optimal/reference (most concerning first)
- Out of range first
- Trending toward boundary

**Test card (in list):**
- Test name + category badge
- Most recent value + unit
- Status dot: green (optimal) / yellow (suboptimal but in range) / red (out of range) / gray (no range data)
- Trend arrow (↑ / ↓ / → / —)
- Date of last test
- Mini sparkline (last 5 values) — optional, lower priority

**Action buttons:**
- [ ] "Compare" — enters multi-select mode (checkboxes appear on cards), "Compare (N)" button appears, opens comparison sheet
- [ ] "Export CSV" — exports current filtered view to CSV
- [ ] "Manage Tests" — opens merge/rename sheet (Phase 8)

### CSV Export

Exports only what's in the current filtered list. Columns:
```
Test Name, Canonical Name, Category, Date, Value, Unit, Ref Low, Ref High, In Range, Optimal Low, Optimal High, In Optimal Range
```
One row per historical data point (not just most recent), filtered to the date range in the current filter.

---

## Phase 4: Test Detail Sheet

**Goal:** History chart, reference range visualization, stats strip for a single test.

### Component: `LabTestDetailSheet`

Opens from tapping a test card. Resizable (`storageKey="lab_test_detail_sheet_width"`, `defaultWidth={720}`).

**Sections (top to bottom):**

#### 1. Header
- Test name, canonical name (smaller, muted), category badge, unit
- Last tested date

#### 2. Reference Range Bar
Horizontal bar visualization:

```
[  LOW  |————————IN RANGE————————|  HIGH  ]
                    ▲ current value dot
```

- Full range (ref_low + ref_high): shaded band with dot
- Low-only (ref_low only, i.e. "≥ X"): left-anchored bar, right arrow indicating open-ended
- High-only (ref_high only, i.e. "≤ X"): right-anchored bar, left arrow
- Text-only (ref_text, no numerics): show text result as pass/fail chip, no bar
- No range data: show "No reference range available"
- When optimal ranges enabled: second inner band overlaid in different color/opacity

#### 3. History Chart (Recharts LineChart)
- Time-proportional X-axis (same pattern as rest of app — `type="number"` with timestamp dataKey)
- Y-axis: auto-scaled to data + some padding
- Reference range band: `<ReferenceArea>` between ref_low and ref_high (green-tinted)
- Optimal range band: `<ReferenceArea>` between opt_low and opt_high (darker green, only when toggle on)
- One-sided ranges: `<ReferenceLine>` with label instead of band
- Dots colored by status: green (optimal) / yellow (suboptimal) / red (out of range) / gray (no range)
- Year markers: `<ReferenceLine>` at Jan 1 of each year (same pattern as rest of app)
- Date range filter: 1y / 2y / 5y / All (pill buttons, same as ExerciseStatsSheet)
- Tooltip: date, value, unit, status, reference range, optimal range

#### 4. Stats Strip
```
Min    Max    Avg    Trend    Out of Range    Suboptimal
```

#### 5. Visit History Table
Scrollable table of all data points:
- Date | Lab | Value | Unit | Status | Actions (edit/delete)
- Clicking a row could navigate to that visit in the main /labs page

---

## Phase 5: Optimal Ranges

**Goal:** Gender/age-aware optimal ranges as a toggleable overlay.

### Database

- [ ] Migration: `lab_optimal_ranges` table
  ```sql
  lab_optimal_ranges (
    id UUID PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    opt_low DECIMAL,
    opt_high DECIMAL,
    gender TEXT,              -- NULL = applies to all, 'male', 'female'
    age_min INTEGER,          -- NULL = no lower age bound
    age_max INTEGER,          -- NULL = no upper age bound
    source_note TEXT,         -- e.g. "Peter Attia / longevity medicine"
    created_at TIMESTAMPTZ
  )
  ```
- [ ] Seed data (~60 common tests) — see seed list below
- [ ] API: included in `GET /api/labs/panel` response (joined against user's gender/age)
- [ ] User override table:
  ```sql
  lab_optimal_overrides (
    owner_id UUID,
    canonical_name TEXT,
    opt_low DECIMAL,
    opt_high DECIMAL,
    PRIMARY KEY (owner_id, canonical_name)
  )
  ```

### Seed Data (initial list)

| Canonical Name | Opt Low | Opt High | Gender | Notes |
|---|---|---|---|---|
| Testosterone Total | 500 | 800 | male | Longevity/functional medicine |
| Testosterone Total | 50 | 150 | female | |
| HbA1c | null | 5.3 | null | <5.3% optimal |
| Fasting Glucose | 72 | 85 | null | |
| LDL | null | 70 | null | Cardiovascular optimal |
| HDL | 60 | null | male | |
| HDL | 70 | null | female | |
| Triglycerides | null | 80 | null | |
| ApoB | null | 60 | null | |
| hsCRP | null | 0.5 | null | |
| Vitamin D | 50 | 80 | null | ng/mL |
| TSH | 1.0 | 2.5 | null | |
| Free T3 | 3.2 | 4.2 | null | |
| Free T4 | 1.3 | 1.8 | null | |
| Ferritin | 50 | 150 | male | |
| Ferritin | 30 | 100 | female | |
| B12 | 600 | 1200 | null | pmol/L |
| Folate | 15 | null | null | |
| Magnesium | 2.0 | 2.5 | null | mg/dL |
| Zinc | 90 | 120 | null | ug/dL |
| Homocysteine | null | 8 | null | umol/L |
| Insulin Fasting | null | 6 | null | uIU/mL |
| ALT | null | 25 | male | IU/L (lower than std ref) |
| ALT | null | 20 | female | |
| AST | null | 25 | null | |
| GGT | null | 20 | null | |
| Uric Acid | 3.5 | 5.5 | male | mg/dL |
| Uric Acid | 2.5 | 4.5 | female | |
| Creatinine | 0.9 | 1.1 | male | mg/dL |
| eGFR | 90 | null | null | >90 optimal |
| PSA | null | 1.0 | male | age <50 |
| PSA | null | 2.0 | male | age 50-70 (age_min=50, age_max=70) |
| DHEA-S | 350 | 500 | male | ug/dL, age 30-50 |
| Cortisol AM | 10 | 18 | null | ug/dL |
| WBC | 4.5 | 7.0 | null | K/uL (tighter than ref) |
| Neutrophils % | 40 | 60 | null | |
| Lymphocytes % | 25 | 40 | null | |
| ... | | | | (expand as needed) |

### UI Toggle

- [ ] "Optimal Range" toggle in the filter bar on `/labs/panel` (defaults to ON for users with profile set)
- [ ] Also shown as a toggle in the detail sheet header
- [ ] When ON: reference range bar shows two overlaid bands; chart shows two ReferenceArea bands

---

## Phase 6: Multi-Test Comparison

**Goal:** Same interface pattern as DT multi-metric comparison.

### Component: `LabCompareSheet`

- Triggered by: entering select mode on `/labs/panel` → selecting 2+ tests → clicking "Compare (N)"
- Resizable sheet (`storageKey="lab_compare_sheet_width"`, `defaultWidth={800}`)

**Layout (matching DT comparison):**
- Shared time-proportional LineChart at top
  - Each test = one Line, auto-colored
  - Dual Y-axis if units differ significantly (or normalize option)
  - Legend showing test name + current value
  - Date range filter: 1y / 2y / 5y / All
- Below chart: one stat strip per test (min/max/avg/trend)
- Add/remove tests from the comparison via a small "+ Add Test" control

**Implementation notes:**
- Need to handle different units — either dual Y-axis (Recharts supports this with `yAxisId`) or a normalize-to-percentage-of-range option
- Reference/optimal bands omitted in comparison view (too cluttered) — consider an option to show them per-line

---

## Phase 7: Body Systems Radar Chart

**Goal:** At-a-glance system health overview at the top of `/labs/panel`.

### System → Test Mapping

| System | Key Tests |
|---|---|
| Cardiovascular | LDL, HDL, Triglycerides, ApoB, hsCRP |
| Metabolic | Glucose, HbA1c, Insulin, eGFR |
| Liver | ALT, AST, GGT, Bilirubin, Albumin |
| Kidney | Creatinine, BUN, eGFR, Uric Acid |
| Blood (CBC) | WBC, RBC, Hemoglobin, Hematocrit, Platelets |
| Thyroid | TSH, Free T3, Free T4 |
| Hormonal | Testosterone, DHEA-S, Estradiol, Cortisol |
| Nutritional | Vitamin D, B12, Ferritin, Folate, Magnesium |

### Scoring

Each test score = 0–100 based on where value falls:
- 100 = center of optimal range
- 70–99 = in optimal range, slightly off-center
- 40–69 = in reference range but outside optimal (suboptimal)
- 0–39 = outside reference range (scaled by how far out)
- No data = excluded from system average

System score = average of its available test scores.

### Component: `LabSystemsRadar`

- Recharts `RadarChart` with `Radar` + `PolarGrid` + `PolarAngleAxis`
- Collapsible (defaults to collapsed if all systems are green, expanded if any red/yellow)
- Clicking a system node scrolls/filters the test list to that category
- Toggle: "Show with optimal ranges" / "Show with reference ranges only"

---

## Phase 8: Test Merging ("Manage Tests")

**Goal:** Fix canonical name mismatches — merge two tests that are the same thing.

### Component: `LabManageSheet`

Opens from "Manage Tests" button on `/labs/panel`.

- [ ] List all unique canonical names with test count
- [ ] Search/filter
- [ ] Select two → "Merge" → confirm dialog
  - "Merge [Source] into [Target]" — all lab_results rows with source canonical_name updated to target
  - Source canonical_name disappears from the list
- [ ] Also allow rename (just update canonical_name for all matching rows)
- [ ] API: `POST /api/labs/manage/merge` — `{ source: string, target: string }`
- [ ] API: `POST /api/labs/manage/rename` — `{ canonical_name: string, new_name: string }`

---

## Phase 9: ChatGPT API Context (Later)

**Goal:** Provide lab panel data as context for AI health conversations.

When a user opens a chat with the AI assistant:
- Include all unique tests, most recent values, status vs. reference/optimal range, trend direction
- Include user gender/age for context
- AI can flag concerning trends, suggest follow-up tests, explain values in plain language

Implementation: extend the existing AI context payload with a labs summary object. Low priority — do after all other phases are solid.

---

## Data Flow Summary

```
Supabase
  lab_visits → lab_results (test data)
  lab_optimal_ranges (seeded, system-wide)
  lab_optimal_overrides (per-user overrides)
  user_profile (gender, birth_year)

API Layer
  GET /api/labs/panel           → aggregated test history + trends + optimal ranges
  GET/PATCH /api/labs/visits/[id]   → visit metadata edit
  PATCH /api/labs/results/[id]      → result edit
  POST /api/labs/visits/[id]/results → add result to existing visit
  POST /api/labs/manage/merge       → canonical name merge
  POST /api/labs/manage/rename      → canonical name rename
  GET/PATCH /api/profile            → user gender/birth_year

Frontend
  /labs             → visit list (existing, + edit mode)
  /labs/panel       → test panel, filters, comparison, radar
  /settings         → profile card (gender, birth_year)
```

---

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Complete

---

## Open Questions

- Should "hide stale" threshold (12 months) be configurable per-user, or hardcoded?
- Comparison chart: dual Y-axis, or normalize-to-range? Probably offer both as a toggle.
- Optimal ranges: should the seed data be editable by the user globally, or only via per-test overrides?
- Body SVG diagram: future stretch goal after radar chart is validated as useful
- Goals for labs: deferred (optimal ranges covers the same ground for now)
