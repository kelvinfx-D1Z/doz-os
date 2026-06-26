# C5 — Routines Module

## Task
Build a complete Routines module (API + UI) for DOZ OS — gives the founder structured business routines (Morning Briefing, End of Day Wrap, Weekly Business Review, Event Day Run-Sheet, Monthly Close, Sales Pipeline Review) as interactive checklists they can run through and track completion.

## Work Log

### Read prior work
- `worklog.md` (Tasks 1, 4, 5, 7, 8, 9, 10, 11, 12, P2-A+B+D, P4-A, VERIFY, C1+C2) — confirmed foundation conventions: dark emerald theme (NO indigo/blue), shared primitives at `@/components/doz/ui-primitives`, format helpers at `@/lib/format`, API pattern at `src/app/api/doz/<module>/route.ts` with `getSessionUser()` gate from `@/lib/auth`, demo password `doz2025` for all accounts, sonner toast, cancelled-flag useEffect pattern, "use client" modules fetch own data.
- `prisma/schema.prisma` — confirmed `Routine` (id/name/description/frequency/steps-JSON/icon/color/isActive) + `RoutineLog` (id/routineId/userId/status/stepsDone-JSON/startedAt/completedAt) already exist (Task C1+C2 added them). Did NOT modify the schema.
- `prisma/seed.ts` — confirmed 6 routine templates seeded (Morning Briefing amber Sunrise 6 steps; End of Day Wrap violet Moon 5 steps; Weekly Business Review emerald CalendarDays 7 steps; Event Day Run-Sheet teal Clapperboard 11 steps; Monthly Close rose Wallet 8 steps; Sales Pipeline Review amber TrendingUp 6 steps). Did NOT modify the seed.
- `src/lib/auth.ts` — `getSessionUser()` returns `{id, name, email, role, title?}` from JWT session.
- `src/lib/store.ts` — `ModuleId` union had 10 entries (no routines). **Added `"routines"`** to the union.
- `src/components/doz/app-shell.tsx` — NAV/MODULES/MODULE_META/ROLE_MODULES all keyed by ModuleId. Imports 10 modules + sign-in.
- `src/components/doz/ui-primitives.tsx` — `StatCard`, `StatusBadge`, `SectionHeader`, `EmptyState`, `MiniBar` available. `MiniBar` takes `{value, max, color}` where color is a tailwind bg class.
- `src/lib/format.ts` — `relativeTime` is future-event-focused ("X days overdue", "in Xd"). Wrote a local `timeAgo()` helper in the routines UI for past-tense phrasing ("2h ago", "1d ago").
- `src/components/modules/field-mode.tsx` — used as reference for the cancelled-flag useEffect + auth-gated fetch + toast patterns.

### API — `src/app/api/doz/routines/route.ts` (NEW, ~310 lines)

**GET** (auth-gated via `getSessionUser()`; 401 if not authed):
- Single `Promise.all` of 3 Prisma queries: active routines, recent 20 logs (with routine + user included), all completed logs in last 60 days (for streak calc).
- Shapes `routines` — parses `steps` JSON string into array, filters to strings only.
- Shapes `recentLogs` — looks up totalSteps from parent routine, parses `stepsDone` JSON into sorted integer array, surfaces `routineName`/`routineIcon`/`routineColor`/`userName`.
- Computes `stats`:
  - `totalRoutines` — count of active routines.
  - `completedToday` — completed logs since start-of-day (local time).
  - `completedThisWeek` — completed logs since Monday (week starts on Monday).
  - `streakDays` — consecutive days (ending today OR yesterday) with ≥1 completion. Walks back from the most recent completion day until a gap is found. Returns 0 if no completion in last 2 days.

**POST** (auth-gated; 401 if not authed):
- `action: "start"` — validates `routineId` (400 if missing, 404 if not found, 400 if inactive). Creates `RoutineLog` with `status="IN_PROGRESS"`, `stepsDone="[]"`, `userId` from session. Returns `{log: {...}}` with full routine shape + parsed steps array.
- `action: "toggle_step"` — validates `logId` + `stepIndex` (integer ≥0). In a `$transaction`: fetches log+routine, parses current stepsDone, removes stepIndex if present else adds it (sorted), writes back as JSON string. **Auto-complete**: if all steps done → set status `COMPLETED` + `completedAt=now`. **Auto-revert**: if was `COMPLETED` and now not all done → revert to `IN_PROGRESS` + null `completedAt`. Returns `{log: {...}}` with parsed `stepsDone` array. 404 if log not found.
- `action: "complete"` — validates `logId`. Updates log: `status="COMPLETED"`, `completedAt=now`. Returns `{log: {...}}`. Prisma P2025 (record not found) → 404.
- Unknown action → 400.
- All errors wrapped in try/catch with structured `{error, detail?}`.

### UI — `src/components/modules/routines.tsx` (NEW, ~560 lines, "use client", export `Routines()`)

**Header**: `SectionHeader` with `Repeat` icon, title "Routines", subtitle "Your business rhythm — run the same playbook every time".

**Stat row** (4 StatCards, grid sm:grid-cols-4):
- Completed Today — accent primary, emerald CheckCircle2 icon, sub: "X routines available".
- This Week — CalendarDays icon.
- Streak — Flame icon, accent warning (amber) when streak > 0, sub "keep it alive 🔥" or "no streak yet".
- Templates — Repeat icon, value=totalRoutines, sub "active playbooks".

**Frequency filter**: horizontal scrollable pills (All / Daily / Weekly / Event Day / Monthly) with live count badge. Selected = primary ring; unselected = card border.

**Routine grid** (sm:grid-cols-2 lg:grid-cols-3):
- Each routine card uses `border-l-4` with the routine's color accent (`border-amber-500` / `violet` / `emerald` / `teal` / `rose` via COLOR_MAP).
- Card layout:
  - Top row: 10×10 icon tile (color-tinted bg) + FrequencyBadge.
  - Title + 2-line clamped description.
  - Step count + last-run time-ago (looked up from `lastRunByRoutine` map built from recentLogs).
  - "Start routine" button (primary, full-width, Play icon).
- Loading state: 6× Skeleton h-44 cards + header skeleton.
- Error state: EmptyState + Retry button.

**Routine Runner** (Dialog max-w-2xl, no padding on content; runner renders header/progress/steps/footer):
- Header: icon tile + routine name + "Started Xm ago" + frequency badge + description.
- Progress bar: "X of Y steps complete" + percentage + MiniBar colored with the routine's color.
- Step list (scroll-thin, max-h-[55vh], divide-y): each row is a button with min-h-12 (44px touch target), hover:bg-accent/30. Left: CheckCircle2 emerald (done) / Circle muted (undone) / Loader2 spin (toggling). Center: step text — strikethrough + emerald when done. Right: 2-digit step index (01, 02, ...).
- Footer (border-t, bg-card/50): Cancel (ghost, X icon) on left; on right: "Completed" badge if already done + Complete button. **Complete button auto-highlights with `animate-pulse` + emerald bg when all steps done** (pulsing call to action).
- Click step → POST `toggle_step` with logId + stepIndex; updates local state.
- Click Complete → POST `complete`; toast "Routine completed ✓"; closes dialog; refreshes data.
- Click Cancel / overlay → closes dialog (log stays IN_PROGRESS in DB — user could resume later).

**Recent Activity** (bottom, max-h-96 scroll):
- SectionHeader "Recent Activity" + Clock icon.
- Card with divide-y list of recentLogs: icon tile + routine name + "completed 2h ago by Adaeze" + steps done count "X/Y" + CheckCircle2 (done) / Loader2 spin (in progress).
- EmptyState if no logs yet.

**Helpers**:
- `ICON_MAP`: Sunrise / Moon / CalendarDays / Clapperboard / Wallet / TrendingUp → LucideIcon. Falls back to `Repeat`.
- `COLOR_MAP` / `COLOR_BAR` / `COLOR_TILE`: amber/violet/emerald/teal/rose → tailwind class strings for card border-l, MiniBar color, icon tile bg.
- `timeAgo()`: local past-tense formatter ("just now", "5m ago", "3h ago", "2d ago", "1w ago", falls back to formatDate for >5w).
- `minutesSince()`: integer minutes since a timestamp (used for "Started Xm ago" in runner).

### App Shell integration (`src/components/doz/app-shell.tsx` EDITED)
- Added `Repeat` to lucide-react imports.
- Imported `Routines` from `@/components/modules/routines`.
- Added to NAV: `{ id: "routines", label: "Routines", icon: <Repeat className="h-4 w-4" />, group: "Operate" }` — placed after Strategic Planning, before AI Chief of Staff (keeps the "Operate" group's daily-rhythm tools together).
- Added `"routines"` to FOUNDER + STAFF in ROLE_MODULES (NOT interns/freelancers — this is a management tool).
- Added `routines: <Routines />` to MODULES map.
- Added `routines: { title: "Routines", subtitle: "Your business rhythm — run the same playbook every time" }` to MODULE_META.

### Store integration (`src/lib/store.ts` EDITED)
- Added `"routines"` to the `ModuleId` union (was the missing piece — needed for type-safety on NAV/MODULES/MODULE_META/ROLE_MODULES records).

## Testing

### Dev server
- Restarted Next.js 16 Turbopack on port 3000. Ready in ~600ms. Compiled new API route + module cleanly.

### Auth flow (curl)
- POST /api/auth/callback/credentials with `founder@digitonezero.com` + `doz2025` + csrfToken → 302 (success).
- GET /api/auth/session → 200 with `{user:{name:"Adaeze Okonkwo", role:"FOUNDER", title:"Founder & CEO", ...}}`.

### GET /api/doz/routines (authed)
- HTTP 200, returns 6 routines (End of Day Wrap / Morning Briefing / Event Day Run-Sheet / Monthly Close / Sales Pipeline Review / Weekly Business Review).
- Each routine has: id, name, description, frequency, steps (parsed array — 5/6/11/8/6/7 steps respectively), icon, color, isActive.
- `recentLogs: []` initially (no logs yet).
- `stats: {totalRoutines:6, completedToday:0, completedThisWeek:0, streakDays:0}`.

### POST /api/doz/routines (authed) — full lifecycle:
1. `start` with routineId="End of Day Wrap" id → 200, creates log `{status:"IN_PROGRESS", stepsDone:[], totalSteps:5, routine:{name:"End of Day Wrap", steps:[5 items]}}`.
2. `toggle_step` stepIndex=0 → 200, `stepsDone:[0], status:"IN_PROGRESS"`.
3. `toggle_step` stepIndex=1,2,3,4 (in sequence) → 200 each. After last toggle all 5 steps done → **auto-set status to COMPLETED, completedAt set** (verified via subsequent un-toggle).
4. `toggle_step` stepIndex=2 (un-toggle) → 200, `stepsDone:[0,1,3,4], status:"IN_PROGRESS", completedAt:null` — **auto-revert from COMPLETED → IN_PROGRESS works**.
5. `complete` → 200, `status:"COMPLETED", completedAt:"2026-06-25T22:48:10.475Z"`.
6. GET after completion → `stats:{completedToday:1, completedThisWeek:1, streakDays:1}`, recentLogs[0]: `{routineName:"End of Day Wrap", status:"COMPLETED", userName:"Adaeze Okonkwo"}`.

### Auth gate (no auth)
- GET /api/doz/routines → 401 `{error:"unauthorized"}`.
- POST /api/doz/routines → 401 `{error:"unauthorized"}` (all actions gated).

### Page compile
- GET / → HTTP 200, 29548 bytes (sign-in screen renders, app shell compiles cleanly with the new Routines module wired in).

### Lint
- `bun run lint` → EXIT 0, zero errors/warnings across all files (including new routines API + module + edited store + app-shell).

## Stage Summary

- Routines module is fully implemented and verified end-to-end via authenticated curl.
- API: GET /api/doz/routines (lists 6 active routines + last 20 logs + 4 stats) + POST /api/doz/routines (start / toggle_step with auto-complete + auto-revert / complete). All auth via `getSessionUser()`. Prisma transactions used for toggle_step to ensure atomic read-modify-write of the stepsDone JSON array.
- UI: clean focused routine runner with stat row (Completed Today / This Week / Streak / Templates), frequency filter pills, color-accented routine cards (border-l-4), full-screen Dialog runner with progress MiniBar, large min-h-12 step rows (44px touch targets), pulsing emerald Complete button when all steps done, recent activity scroll list with team attribution.
- Color discipline: emerald primary, amber warning/streak, rose danger — NO indigo/blue. Routine card accents use the 5-token palette (amber/violet/emerald/teal/rose) from the seed.
- Files:
  - NEW: `src/app/api/doz/routines/route.ts` (~310 lines)
  - NEW: `src/components/modules/routines.tsx` (~560 lines)
  - EDITED: `src/lib/store.ts` (added "routines" to ModuleId union — 1 line)
  - EDITED: `src/components/doz/app-shell.tsx` (added Repeat import, Routines import, NAV entry in "Operate" group, ROLE_MODULES entry for FOUNDER+STAFF, MODULES map entry, MODULE_META entry)
- Schema unchanged (used existing Routine + RoutineLog models + 6 seeded templates from Task C1+C2).
- Work record saved to `/home/z/my-project/agent-ctx/C5-routines.md`.
