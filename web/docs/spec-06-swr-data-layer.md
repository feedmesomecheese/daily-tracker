# Spec 06 — SWR Data Layer (stale-while-revalidate)

Last updated: 2026-07-17
Status: ⬜ pending
Models: § A **Sonnet 5** · § B **Haiku 4.5**

Every page hand-rolls `fetch` + `useState` + a full-screen loader, so every
navigation shows a blank loading screen even for data fetched seconds ago.
SWR gives instant cache-first renders with background refresh. The daily
loop (Today ↔ workouts ↔ stats sheets) is where this pays off most.

---

## § A — Foundation + reference migration (Sonnet 5)

1. `npm install swr` in `web/`.
2. New `src/lib/useApi.ts`:

   ```ts
   import useSWR from "swr";
   import { getAuthHeaders } from "@/lib/authHeaders";

   const fetcher = async (url: string) => {
     const headers = await getAuthHeaders();
     const res = await fetch(url, { headers });
     const json = await res.json();
     if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
     return json;
   };

   export function useApi<T>(url: string | null) {
     return useSWR<T>(url, fetcher, {
       revalidateOnFocus: true,
       keepPreviousData: true,
     });
   }
   ```

   (`url: null` skips the fetch — SWR's conditional-fetch convention.)
3. Add an `<SWRConfig>` provider in `src/app/layout.tsx` only if global
   options become needed; otherwise skip — the hook's defaults suffice.
4. **Migrate `/summary` as the reference** (`src/app/summary/page.tsx`):
   - Replace `fetchSummary`/`useEffect`/`loading`/`error`/`data` state with
     one `useApi<SummaryResponse>(\`/api/summary?\${params}\`)` call — the
     URL string (with params) is the cache key, so period changes fetch and
     cache per-period automatically.
   - Loading UI only when `!data && isLoading` (first visit); with
     `keepPreviousData`, period switches keep the old view with a subtle
     opacity dim (`isValidating && "opacity-60 transition-opacity"`).
   - Mutations aren't on this page; for pages with saves, call `mutate()`
     from the hook's return after a successful save.

**Verify:** navigate summary → another page → back: renders instantly, no
loader flash; switching periods works; error state still renders on a
forced 500.
**Commit:** `Add SWR data layer; migrate summary page`

## § B — Page-by-page conversion (Haiku 4.5, one commit per page)

Copy the § A pattern exactly. Rules: never restructure the page; only
replace the fetch/state plumbing. Pages with save actions must call
`mutate()` after successful saves. If a page's fetch logic doesn't map
cleanly (multi-step dependent fetches, streaming), skip it and note it.

Order (highest daily traffic first):

- [ ] `src/app/heatmap/page.tsx`
- [ ] `src/app/workouts/log/page.tsx`
- [ ] `src/app/workouts/exercises/page.tsx`
- [ ] `src/app/insights/page.tsx`
- [ ] `src/app/radar/page.tsx`
- [ ] `src/app/books/page.tsx` + `src/app/books/stats/page.tsx`
- [ ] `src/app/metrics/page.tsx`
- [ ] Components: `metric-stats-sheet.tsx`, `ExerciseStatsSheet.tsx`

Explicitly out of scope (complex save-heavy flows — leave alone):
`src/app/page.tsx` (Today form), `src/app/workouts/page.tsx` (entry),
`src/app/food/page.tsx`, `src/app/log/page.tsx`.
