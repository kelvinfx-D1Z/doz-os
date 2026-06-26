# G4 — Focus & Alignment Score

Task ID: G4
Agent: Focus Score Builder (Gap #4)
Task: Build a Focus & Alignment Score system that measures whether daily tasks connect to strategic goals and surfaces misalignment.

## Files created/edited

1. **NEW** `src/app/api/doz/focus/route.ts` (~225 lines)
   - GET endpoint, auth-gated via `getSessionUser()` (returns 401 if no session).
   - Parallel Prisma fetch of (a) all non-DONE tasks (id/category/isDistraction/goalId/status/dueDate) and (b) the next WEEKLY goal that is ACTIVE/ON_HOLD.
   - Plus a separate fetch of today's tasks (any status, dueDate in [startOfToday, endOfToday]) for the daily completion metric.
   - Computes breakdown (strategic/operational/admin/distraction/totalActive), alignment (linkedToGoal/unlinked/alignmentPct), weeklyGoalProgress, dailyTaskCompletion {done, total, pct}, distractionsCount.
   - Focus score algorithm (0-100):
     - alignment score  = alignmentPct * 0.40            (max 40)
     - strategic weight = (strategicTasks/totalActive) * 30 (max 30)
     - distraction pen  = max(0, 20 - distractions*5)    (max 20)
     - weekly progress  = (weeklyGoalProgress/100) * 10   (max 10)
     - total clamped 0-100; if totalActive=0 → score 0 (no measurable focus).
   - Rating: ≥75 ALIGNED (emerald), 50-74 MODERATE (amber), <50 SCATTERED (rose).
   - Recommendations generated in priority order, capped at 3:
     1. "No active tasks — plan your day..." (when totalActive=0)
     2. "No strategic tasks today — are you just firefighting?" (strategicTasks=0 + totalActive>0)
     3. "⚠ X distraction task(s) detected — batch them into a 30-min block" (distractions>0)
     4. "X tasks aren't linked to any goal — link them or deprioritize" (unlinked>3)
     5. "Weekly objective is only X% complete — accelerate" (weeklyGoalProgress<50 AND past midweek, i.e. Wed-Sun)
     6. "Less than half your tasks connect to strategic goals" (alignmentPct<50)
     7. "You're focused and aligned — keep it up" (score>=75)

2. **NEW** `src/components/doz/focus-score-card.tsx` (~360 lines)
   - "use client", exports `FocusScoreCard` + default.
   - Auto-fetches `/api/doz/focus` on mount (cache: no-store), inline async IIFE with `let alive = true` cancellation (matches project pattern to satisfy react-hooks/set-state-in-effect rule).
   - Loading state: full skeleton (ring + breakdown bar + 4 stat tiles + recommendation lines).
   - Error state: rose-tinted card with AlertTriangle.
   - Card uses `border-l-4` colored by rating (emerald/amber/rose) + subtle bg tint.
   - **Score ring**: pure CSS `conic-gradient` — filled arc (score/100 * 360deg) in rating color, remainder in `rgba(255,255,255,0.08)`. Inner 78×78px disc with `bg-card` shows the score (large bold tabular-nums in rating color) + "/ 100" subtitle. ARIA label included.
   - **Breakdown bar**: `h-2 rounded-full` horizontal stacked bar — segments for Strategic (emerald #10b981), Operational (teal #14b8a6), Admin (muted #71717a), Distraction (amber #f59e0b). Legend below with colored squares + counts.
   - **Key stats row**: 4 tiles in `grid-cols-2 sm:grid-cols-4`:
     - Linked (Link2 icon) — `linked/totalActive` + `X% aligned`
     - Distractions (AlertTriangle icon) — count + "Batch & defer" / "All clear"
     - Weekly goal (TrendingUp icon) — `X%` + truncated goal title
     - Today (ListTodo icon) — `done/total` + `X% complete`
   - **Recommendations**: list with smart icon picker — warnings get AlertTriangle (amber), positives get CheckCircle2 (emerald), planning nudges get Clock, generic suggestions get Target. text-xs leading-snug.
   - Compact enough for sidebar width (right column of Command Center).

3. **EDITED** `src/components/modules/command-center.tsx`
   - Added import: `import { FocusScoreCard } from "@/components/doz/focus-score-card";`
   - Inserted `<FocusScoreCard />` as the FIRST item in the right column (above Weekly Objective).
   - Gated by `{(user?.role === "FOUNDER" || user?.role === "STAFF") && (...)}` — interns don't see company alignment metrics. `user` is already available via the existing `useCurrentUser()` hook.

4. **EDITED** `src/components/modules/strategic-planning.tsx`
   - Added import: `import { FocusScoreCard } from "@/components/doz/focus-score-card";`
   - Inserted `<FocusScoreCard />` between the SectionHeader and the KPI row — top of the module, before the goal cascade. (No role gate here — anyone who can access Strategic Planning can see the score; interns already can't reach this module via role-aware nav from G1.)

## Testing

- Restarted dev server (Next.js 16 Turbopack on port 3000) — Ready in ~1s, compiles cleanly.
- Authenticated via curl (csrf → callback/credentials with `founder@digitonezero.com` / `doz2025`):
  - `GET /api/doz/focus` (no auth) → 401 `{"error":"unauthorized"}` ✓
  - `GET /api/doz/focus` (authed) → 200 with full payload ✓
  - Response verified:
    ```
    score: 36, rating: "SCATTERED",
    breakdown: { strategicTasks: 4, operationalTasks: 10, adminTasks: 0, distractionTasks: 1, totalActive: 15 },
    alignment: { linkedToGoal: 3, unlinked: 12, alignmentPct: 20 },
    weeklyGoalProgress: 45,
    weeklyGoal: { id: "...", title: "This Week: Approve 3 POs, sign GTBank event, finish intern onboarding", progress: 45, dueDate: "2026-06-30..." },
    dailyTaskCompletion: { done: 0, total: 4, pct: 0 },
    distractionsCount: 1,
    recommendations: [
      "⚠ 1 distraction task detected — batch them into a 30-min block",
      "12 tasks aren't linked to any goal — link them or deprioritize",
      "Weekly objective is only 45% complete — accelerate"
    ]
    ```
  - Math verified: alignment 20*0.4=8 + strategic 4/15*30=8 + distraction max(0,20-5)=15 + weekly 45/100*10=4.5 = 35.5 → 36 ✓
  - Rating correct: 36 < 50 → SCATTERED ✓
  - Recommendations correct: distraction warning fires (1>0), unlinked warning fires (12>3), weekly-accelerate fires (45<50 AND today is Friday = past midweek). Strategic-tasks-zero did NOT fire because strategicTasks=4>0. Cap at 3 — only the 3 priority recommendations shown. ✓
- `GET /` returns 200 with the page rendering cleanly.
- `bun run lint` → EXIT 0, zero errors/warnings.
- dev.log shows: `GET /api/doz/focus 200` (authed), `GET /api/doz/focus 401` (unauth), `GET / 200 in 52ms` — all expected, no compile errors.

## Color discipline

- Emerald primary (ALIGNED + Strategic segment + Linked icon).
- Amber warning (MODERATE + Distraction segment + AlertTriangle).
- Rose danger (SCATTERED + error card border).
- Teal accent (Operational segment).
- Muted/zinc for Admin segment.
- NO indigo, NO blue (except where already used elsewhere in the codebase).

## Notes

- The FocusScoreCard is independent of the dashboard aggregate fetch — it makes its own `/api/doz/focus` call. This is intentional: the focus score is a derived metric, not raw data, and isolating it lets us refresh or extend it without touching the dashboard payload.
- Both the Command Center and Strategic Planning mount separate instances of FocusScoreCard — each fetches once on mount. Acceptable for a read-only derived metric; if this becomes a perf concern later, the parent could fetch once and pass props.
- "Past midweek" = Wednesday or later (Mon-Sun week). `getDay()===0` (Sunday) or `getDay()>=3` (Wed-Sat).
