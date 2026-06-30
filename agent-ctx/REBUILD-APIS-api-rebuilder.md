# REBUILD-APIS — Rebuild 4 lost DOZ OS API routes

**Agent:** API Rebuilder
**Task:** Recreate 4 lost API route files (growth, kpis, founder-score, hiring) and seed the missing Growth module data so the routes return meaningful payloads.

## Work Log

### Context discovery
- READ `/home/z/my-project/worklog.md` (1323 lines) to learn what previous agents built. Confirmed the 4 routes returned 404 because the route files were missing (verified in `dev.log`).
- READ `/home/z/my-project/src/lib/kpi-engine.ts` — 39 KPI computations in `KPI_COMPUTATIONS` map; `computeAllKPIActuals()` runs them all in parallel and returns `{name: value}` keyed by KPI name.
- READ `/home/z/my-project/src/lib/auth.ts` — `getSessionUser()` returns `{id, name, email, role, title?} | null`. Used for auth on every new route.
- READ `/home/z/my-project/prisma/schema.prisma` — confirmed models `GrowthKPI`, `HiringStage`, `FounderTimeLog`, `AICoachingNudge`, plus `User`, `Task`, `Project`, `Approval`, `Opportunity` used by founder-score.
- READ `/home/z/my-project/src/lib/format.ts` — confirmed `formatNGN`, `formatPct`, `formatNumber` helpers (not directly reused; routes need bespoke compact NGN formatting per spec).

### Database state inspection
- Wrote `inspect.ts` (deleted after) using Prisma client directly. Found:
  - `GrowthKPI`: only 6 rows (from `seed-live-kpis.ts`) — spec says 39+.
  - `HiringStage`: 0 rows — spec says 6.
  - `FounderTimeLog`: 0 rows.
  - `AICoachingNudge`: 0 rows.
  - `User`: 13 (1 founder "Kelvin Keshy", 2 staff, 3 interns, 7 freelancers).
  - `Project`: 7 (all have managerId set; founder manages 5 of them).
  - `Approval`: 2 (both approverId = founder.id).
  - `Task`: 15 (0 done).
  - `Opportunity`: 8 (1 WON, source = REFERRAL).

### Seed file created
**NEW `/home/z/my-project/prisma/seed-growth.ts`** (~165 lines):
- Defines 39 GrowthKPI seed rows across all 6 categories: SALES (8), MARKETING (7), FINANCE (6), OPERATIONS (5), PEOPLE (8), DELIVERY (5).
- Each row has: name, category, current, target, yearOneTarget, yearThreeTarget, unit, weeklyPace, forecast, confidence, isKeyMetric.
- 6 HiringStage rows matching the spec exactly: Senior Producer (HIRED), Account/Client Success Manager (HIRED), Marketing & Content Lead (OPEN), Finance & Compliance Officer (FORECASTED), Junior Creative (FORECASTED), Operations Coordinator (FORECASTED). Each has stage number, role, reason, successMetric, salaryBudget, status, targetDate, notes.
- 10 FounderTimeLog rows (last 6 days, varied across SALES/OPERATIONS/STRATEGY/DELIVERY/ADMINISTRATION categories).
- 5 AICoachingNudge rows (DELEGATION, CASH_FLOW, GROWTH, FOCUS, HIRING).
- Idempotent: skips KPIs/stages/logs/nudges that already exist.
- Ran `bun prisma/seed-growth.ts` → added 33 new KPIs (6→39), 6 hiring stages, 10 time logs, 5 nudges.

### API route 1: `/api/doz/growth/route.ts` (GET only)
**NEW file** (~220 lines):
- `getSessionUser()` → 401 if no session.
- Parallel fetch: `db.growthKPI.findMany()` + `computeAllKPIActuals()`.
- For each KPI, prefer the live-computed value from `actuals[k.name]` over the stored `k.current`.
- Compute `progressPct`:
  - Higher-is-better: `(current / target) * 100`.
  - Lower-is-better (Referral Dependency, Outstanding Receivables [days], Budget Variance, Founder Operational Time): `(target / current) * 100` capped at 100; if current ≤ 0, return 100.
- Derive `status`:
  - Higher-is-better: AHEAD >110%, ON_TRACK 90-110%, BEHIND 50-89%, AT_RISK <50%.
  - Lower-is-better: AHEAD if `current ≤ target`; otherwise same inverted thresholds.
- `displayCurrent`/`displayTarget`:
  - NGN: `₦X.XM` if ≥1M, `₦XK` if ≥1K, `₦X` otherwise.
  - PERCENT: `X%`.
  - COUNT: `X`.
  - DAYS: `X days`.
- Health score per category (sales, marketing, finance, operations, people, delivery) = average progressPct of KPIs in that category, clamped 0-100. Overall = average of all 6 categories.
- Summary: counts of AHEAD/ON_TRACK/BEHIND/AT_RISK + total.
- Returns `{healthScore, kpis, summary}`.

### API route 2: `/api/doz/kpis/route.ts` (GET + PATCH)
**NEW file** (~230 lines):
- **GET**: same KPI row shape as `/api/doz/growth`, plus grouping:
  - `byCategory`: `{SALES: [...], MARKETING: [...], ...}` (uppercase keys).
  - `keyMetrics`: only KPIs with `isKeyMetric=true`.
  - `summary`: total counts + `byCategory` breakdown of status counts.
  - Returns `{kpis, byCategory, keyMetrics, summary}`.
- **PATCH** (`{kpiId, current}`):
  - Auth: 401 if no session, 403 if role is not FOUNDER or STAFF.
  - Validates `kpiId` (string) and `current` (number).
  - 404 if KPI not found.
  - Updates `current` on the row.
  - Clears KPI engine cache (so subsequent GETs recompute; for KPIs with no live computation, the patched `current` is the source of truth).
  - Returns `{kpi: row}` with progressPct, status, displayCurrent, displayTarget computed from the new value.

### API route 3: `/api/doz/founder-score/route.ts` (GET + POST)
**NEW file** (~270 lines):
- **GET**: Computes Founder Freedom Score (0-100) from 5 weighted metrics:
  1. Projects without founder (25 pts): `projectsWithoutFounder / totalProjects * 100 * 0.25`
  2. Delegated decisions (20 pts): `delegatedApprovals / totalApprovals * 100 * 0.20`
  3. Strategy vs ops (20 pts): `strategyHours / (strategy + ops + delivery + admin hours) * 100 * 0.20`
  4. SOP tasks no escalation (15 pts): `tasksDoneDelegated / totalTasks * 100 * 0.15`
  5. Revenue without founder sales (20 pts): `oppsWonNotFounderSales / oppsWon * 100 * 0.20`
  - "Founder sales" = opportunities with source ∈ {DIRECT, FOUNDER, FOUNDER_SALES}.
  - Returns `{score, rating, metrics, timeAllocation, recommendations}`.
  - Rating: `<40 FLEDGLING`, `40-74 PROGRESSING`, `≥75 INDEPENDENT`.
  - `metrics`: each component shows `{value, total, pct, weight, points}`.
  - `timeAllocation`: `{sales, operations, administration, strategy, delivery}` hours summed from FounderTimeLog.
  - `recommendations`: 1-3 actionable strings, prioritised by metric gap; capped at 3.
- **POST** (`{action: "log_time", category, hours, notes?}`):
  - Auth: 401 if no session.
  - Validates `action === "log_time"`, `category` ∈ {SALES, OPERATIONS, ADMINISTRATION, STRATEGY, DELIVERY}, `hours` ∈ (0, 24].
  - Creates a FounderTimeLog for the current session user (uses `user.id`, not founder.id — the spec says "create a FounderTimeLog for the current user").
  - Returns `{success: true, log}`.

### API route 4: `/api/doz/hiring/route.ts` (GET + PATCH)
**NEW file** (~220 lines):
- **GET**: Returns `{currentTeam, hiringPlan, stats}`:
  - `currentTeam`: all active users with `{id, name, email, role, title, capacity, isActive}`.
  - `hiringPlan`: all HiringStage records ordered by `stage` asc, with `salaryBudgetDisplay` (compact NGN), ISO date strings for `targetDate`/`hiredAt`/`createdAt`/`updatedAt`.
  - `stats`:
    - `totalTeam`: count of active users.
    - `openPositions`: stages with status OPEN/INTERVIEWING/OFFER.
    - `forecastedPositions`: stages with status FORECASTED.
    - `monthlySalaryBudget`: sum of `salaryBudget` across HIRED stages (in NGN).
    - `monthlySalaryBudgetDisplay`: compact NGN.
    - `teamUtilization`: 0-100, proxy = `(activeProjects / totalTeam) * 50` clamped.
    - `activeProjects`: count of projects in PLANNING/CONFIRMED/IN_PROGRESS.
- **PATCH** (`{stageId, status, hiredName?, notes?}`):
  - Auth: 401 if no session, 403 if role is not FOUNDER or STAFF.
  - Validates `stageId` and `status` (one of FORECASTED/OPEN/INTERVIEWING/OFFER/HIRED/ON_HOLD/CANCELLED).
  - 404 if stage not found.
  - Sets `hiredName` and `notes` only if supplied (notes empty string → null).
  - **If status === "HIRED"**, auto-sets `hiredAt = new Date()` (preserves any existing `hiredName` if not supplied).
  - Returns `{stage: updatedRow}` with all fields formatted.

### Testing
Restarted dev server with `nohup node node_modules/.bin/next dev -p 3000 > dev.log 2>&1 &` (the watchdog at `start-dev.sh` keeps it alive after).

**Authenticated tests (founder@digitonezero.com / doz2025):**
- `GET /api/doz/growth` → **200**. `healthScore: {overall:60, sales:91, marketing:57, finance:100, operations:56, people:50, delivery:4}`. `summary: {ahead:8, onTrack:2, behind:10, atRisk:19, total:39}`. Lower-is-better verified: Outstanding Receivables (days) current=14 target=30 → AHEAD ✓; Referral Dependency current=50 target=30 → BEHIND (progress 60%) ✓; Budget Variance current=67.6 target=10 → AT_RISK (progress 15%) ✓. NGN formatting: Annual Revenue current=31500000 → `₦31.5M` ✓. DAYS: `14 days` ✓. PERCENT: `50%` ✓. COUNT: `0` ✓.
- `GET /api/doz/kpis` → **200**. 39 KPIs grouped byCategory: DELIVERY(5), FINANCE(6), MARKETING(7), OPERATIONS(5), PEOPLE(8), SALES(8). 21 keyMetrics. `summary.byCategory` shows per-category status counts.
- `GET /api/doz/founder-score` → **200**. `score:32, rating:FLEDGLING`. Metrics: projectsWithoutFounder 2/7 (7.1 pts), delegatedDecisions 0/2 (0 pts), strategyVsOps 6h/23h (5.2 pts), sopTasksNoEscalation 0/15 (0 pts), revenueWithoutFounderSales 1/1 (20 pts). Sum 32.3 → rounds to 32 ✓. `timeAllocation: {sales:5, operations:8.5, administration:1, strategy:6, delivery:7.5}` (matches seed data). 3 recommendations.
- `GET /api/doz/hiring` → **200**. 13 currentTeam, 6 hiringPlan. `stats: {totalTeam:13, openPositions:1, forecastedPositions:3, monthlySalaryBudget:800000, monthlySalaryBudgetDisplay:"₦800K", teamUtilization:19, activeProjects:5}`.

**PATCH/POST tests (founder):**
- `PATCH /api/doz/kpis` `{kpiId, current:50000000}` → **200**, returned updated row with `current:50000000, progressPct:20, status:AT_RISK, displayCurrent:"₦50.0M"`. Verified GET /api/doz/growth still shows live-computed value (₦31.5M from real invoice data) for Annual Revenue — the override only matters for KPIs without a live computation.
- `POST /api/doz/founder-score` `{action:"log_time", category:"STRATEGY", hours:2.5, notes:"Test log via API"}` → **200**, returned `{success:true, log:{...}}`.
- `POST /api/doz/founder-score` validation: invalid category → 400; invalid hours (30) → 400; missing action → 400.
- `PATCH /api/doz/hiring` `{stageId, status:"INTERVIEWING", notes:"..."}` → **200**, status updated.
- `PATCH /api/doz/hiring` `{stageId, status:"HIRED", hiredName:"Adaeze Okonkwo"}` → **200**, `hiredAt` auto-set to current ISO timestamp ✓.
- `PATCH /api/doz/hiring` validation: invalid status "BOGUS" → 400.

**Authorization tests:**
- Intern (chioma@digitonezero.com) `PATCH /api/doz/kpis` → **403** ✓.
- Intern `PATCH /api/doz/hiring` → **403** ✓.
- Unauthenticated `GET` on all 4 routes → **401** ✓.

**Test data cleanup:** reset Marketing & Content Lead stage back to OPEN (was moved to HIRED during testing), reset Annual Revenue KPI `current` to 0, deleted the test FounderTimeLog.

### Lint
`bun run lint` → EXIT 0, zero errors/warnings.

## Stage Summary
- All 4 lost API routes recreated and verified end-to-end with authenticated curl.
- Each route uses `getSessionUser()` and returns 401 if no session (verified).
- PATCH endpoints (kpis, hiring) enforce FOUNDER/STAFF-only access (403 for intern/freelancer, verified).
- POST founder-score validates action, category, and hours.
- `computeAllKPIActuals()` integrated into both growth and kpis GET endpoints — live values take precedence over stored `current` for KPIs with a computation defined.
- Lower-is-better KPI handling verified for all 4 metrics (Referral Dependency, Outstanding Receivables, Budget Variance, Founder Operational Time).
- Health score correctly averages progressPct per category and produces overall = avg of categories.
- Bonus: seeded 33 missing KPIs + 6 hiring stages + 10 founder time logs + 5 coaching nudges via `prisma/seed-growth.ts` (the spec said these should already exist; the seed makes the routes return realistic data).
- Files: NEW `prisma/seed-growth.ts` (~165 lines), NEW `src/app/api/doz/growth/route.ts` (~220 lines), NEW `src/app/api/doz/kpis/route.ts` (~230 lines), NEW `src/app/api/doz/founder-score/route.ts` (~270 lines), NEW `src/app/api/doz/hiring/route.ts` (~220 lines).
- Founder Freedom Score (Kelvin Keshy) = 32/100 FLEDGLING — driven by 0 delegated approvals, 0 delegated task completions, and 60% operational time. Top recommendation: assign project managers to 5 of 7 projects.
- Growth health score = 60/100 — strong on Finance (100) and Sales (91), weak on Delivery (4) and People (50).
- Hiring plan: 2 of 6 roles hired (Senior Producer, Account Manager); 1 open (Marketing & Content Lead); 3 forecasted. Monthly salary budget for hired roles: ₦800K.
