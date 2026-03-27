# Multi-Module Updates — March 2026

Consolidated plan for all items discussed 2026-03-27.
Status key: ✅ done · 🔄 in progress · ⬜ pending · ❓ needs decision

---

## 1. HIIT Timer — Skip Fill Animation Fix ✅
**Module:** Workouts
**File:** `src/hooks/useWorkoutTimer.ts`

### Problem
`tabNextPhase` (skip button) calls `applyPhase()` which does NOT increment
`tabCompletedWorkCyclesRef`. Only `advancePhase()` (natural timer expiry)
increments it. The fill animation in `WorkoutTimerSheet` reads
`tabCompletedWorkCycles` to compute fill %, so skipped "on" phases never
advance the fill.

### Fix
In `tabNextPhase`, before calling `applyPhase(result)`, check if the current
phase is `"on"` and increment the counter — same logic as `advancePhase`.

---

## 2. Labs Radar — Fix Hint Text + Restore Hover ✅
**Module:** Labs
**File:** `src/app/labs/panel/components/LabSystemsRadar.tsx`

### Hint text
Change: `"Click a node or label to filter · hover for details"`
To: `"Click a label to filter · hover for details"`
(clicking radar nodes was never reliable; labels are the correct affordance)

### Hover
`ScoreDot` renders a static SVG circle that doesn't fire Recharts'
`activePayload`. Fix: change `dot` prop to a closure that passes `onHover`
callback into `ScoreDot`. Add `onMouseEnter`/`onMouseLeave` directly on the
`<circle>` element. Remove dependence on `RadarChart.onMouseMove`.

---

## 3. Food — Today Button ✅
**Module:** Food
**File:** `src/app/food/page.tsx`

### Change
`isToday` is already computed. When `!isToday`, show a small "Today" button
in the date navigation header (between the arrows, below/beside the date
label) that calls `setCurrentDate(getLocalDateString())`.

---

## 4. Food — Meal Template Button in Card Footer ✅
**Module:** Food
**Files:** `src/app/food/components/FoodLogMealCard.tsx`, `src/app/food/page.tsx`

### Change
- Add `hasTemplates?: boolean` prop to `FoodLogMealCard` and `SortableMealCardProps`
- Add a "Use Template" button next to "Add Food" in the card footer (only
  when `hasTemplates === true`)
- Clicking it calls `onApplyTemplate(meal.id)` — same handler as the existing
  overflow-menu "Apply Template" item, which opens `MealTemplateSheet` in
  "apply" mode and merges items into the existing meal
- Pass `hasTemplates={templates.length > 0}` from `food/page.tsx`

---

## 5. Remove Unused Pages ✅
**Module:** Daily Tracker
**Files:**
- `src/app/dashboard/page.tsx` — DELETE
- `src/app/search/page.tsx` — DELETE
- `src/app/stats/page.tsx` — DELETE
- `src/components/nav-menu.tsx` — remove the 3 nav entries

> **Note:** "Moving Avg" was not found as a route — may already be gone.

---

## 6. Labs — HIPAA Disclaimer on Upload Slide ✅
**Module:** Labs
**File:** `src/app/labs/components/LabUploadSheet.tsx`

### Change
Add a small disclaimer below the drag-drop zone in the upload step:

> *This app is not HIPAA-compliant. Do not upload reports containing
> protected health information shared with others. Always verify imported
> values for accuracy before use.*

Style: `text-xs text-muted-foreground` in a subtle callout block.

---

## 7. Food Goals — One Goal Per Nutrient + Min Buffer ⬜
**Module:** Food
**Files:** `src/app/food/goals/page.tsx`, API routes, `MacroSummaryBar.tsx`

### Decision needed before implementing
**Q1:** Enforce one goal per nutrient? (User answer: YES — limit to one goal
per nutrient: calories, protein, carbs, fat, fiber)

**Q2:** Should being within 2% *under* a `min` goal count as "met" (green)?
Example: 201g / 203g protein = 99.0% → currently shows warning.

### Implementation plan
1. **UI enforcement:** On the goals page, if a goal already exists for a
   nutrient, show an "Edit" state instead of "Add" — no second goal allowed.
2. **Migration:** For existing users with duplicate nutrient goals, keep only
   the most recently created one, delete the rest.
3. **Optional — min buffer:** If Q2 answer is yes, change `goalStatus` in
   `MacroSummaryBar.tsx`:
   - `min` direction: `met` if `pct >= 0.98` (within 2% under),
     `warn` if `pct >= 0.90`, `over` if below
   - Symmetric for `max`: `met` if `pct <= 1.02`
4. **MacroSummaryBar:** Since there's now at most one goal per nutrient,
   `findGoal()` is always unambiguous — no change needed.

---

## 8. Labs — Loading Animation (Syringe) ⬜
**Module:** Labs
**Files:** `src/components/loading/` (new: `LabsLoader.tsx`)

### Plan
Create a `LabsLoader` SVG animation — a syringe that "fills up" from empty
to full. Style to match other loaders (`FoodLoader`, etc.).

Insert into `src/app/labs/page.tsx` alongside `LoadingScreen`.

**Q:** Do you want to review the syringe design before I commit to an
implementation, or should I just build it and you can adjust?

---

## 9. General — Custom AI Connections (Systematize GPT/Claude/Gemini) ⬜
**Module:** Settings / New feature

### Summary
Expose a structured "AI Context" API endpoint (or downloadable system prompt)
that any AI can consume. Schema versioning so prompt auto-updates when
columns change.

### Plan (needs scoping session)
1. Add `/api/ai-context` endpoint that returns current schema + recent data
   summary in a structured prompt format
2. Settings UI: "Connect AI Assistant" — generates a setup guide per provider
   (ChatGPT custom GPT, Claude Projects, Gemini Gems)
3. Schema sync: version the context payload; AI context endpoint always
   reflects latest structure

**Q:** Is your current GPT integration using a custom Action (API call) or
a pasted system prompt? This determines the architecture.

---

## 10. Email Data Backups ⬜
**Module:** Settings
**Files:** New API route, settings page, cron job

### Plan
1. **Settings UI** (`/settings`): Add "Email Backups" section
   - Email address input
   - Frequency selector (daily / weekly / monthly)
   - "Last sent" display
   - Manual "Send now" button
2. **API:** `POST /api/exports/email` — assembles exports for each module
   (food, workouts, labs, daily tracker), filters to records since
   `last_email_export_at` timestamp, attaches as CSV/JSON, sends via email
   provider (Resend or SendGrid)
3. **DB:** Add `email_backup_config` table (user_id, email, frequency,
   last_sent_at)
4. **Cron:** Supabase scheduled function or Vercel cron (`/api/cron/email-backup`)
   runs daily, checks each user's frequency setting, sends if due

**Q:** Do you have Resend or SendGrid already set up, or would this be new?

---

## 11. Auto-Approve Claude Code Commands ⬜
**Module:** Dev tooling
**File:** `.claude/settings.local.json` (or `~/.claude/settings.json`)

### Plan
Use Claude Code's built-in permission system. Add broad `allow` rules to
`settings.local.json` for trusted tool categories (Bash, Edit, Write, etc.).

Can be set up immediately via `/update-config`.

---

## 12. Loading Animations — External Formats ⬜
**Module:** All
**Notes:** Informational answer provided; no code changes yet.

### Supported formats
- **Lottie (.json)** — recommended. Use `lottie-react` package. Tiny file
  size, smooth, from After Effects/LottieFiles/Rive.
- **SVG + CSS** — already in use; fine for simple loops.
- **WebM/MP4** — works as `<video autoplay loop muted playsInline>`.
- **APNG** — supported natively in browsers.
- **GIF** — works but avoid (large, low quality).

### Migration plan (when ready)
1. `npm install lottie-react`
2. Create `src/components/loading/LottieLoader.tsx` wrapper
3. Replace SVG loaders one-by-one as external animations are provided

---

## 13. Native Android/iOS App ⬜
**Module:** Infrastructure
**Notes:** Informational answer provided; no code changes yet.

### Options (in order of effort)
1. **Capacitor** (recommended) — wraps existing Next.js app in native shell.
   Gets you App Store + Play Store. Push notifications, native APIs.
   ~1–2 weeks to get a working build.
2. **React Native** — full rewrite of UI layer. Months of work.
3. **PWA** (current) — install from browser; not App Store distributable.

**Q:** Is App Store distribution a goal, or is the current "install from
browser" experience good enough for now?

---

## 14. Remove Unused Pages — Moving Avg ✅ (already gone)
**See item 5** — dashboard, search, stats removed. Moving Avg route was not
found in `src/app/` and appears to already be deleted.

---

## Offline Support (bonus) ⬜
**Module:** Infrastructure

### Plan (needs dedicated scoping)
1. Service worker for caching static assets + read-only data
2. IndexedDB queue for writes made while offline
3. Sync-on-reconnect with conflict resolution strategy
4. Heaviest lift is conflict resolution — two writes to same metric offline
   vs. online need a merge policy

**Q:** What's the offline priority — read-only (view past data) or full
read/write? Read-only is 80% easier.
