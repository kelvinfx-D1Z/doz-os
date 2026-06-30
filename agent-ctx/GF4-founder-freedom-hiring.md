# Task GF4 — Founder Freedom Score & Hiring Dashboard

## Task
Build two features for DOZ OS:
1. **Founder Freedom Score** — prominent metric on Command Center measuring founder independence
2. **Hiring Dashboard** — new module tracking the 6-stage hiring plan

## Files
- `src/app/api/doz/founder-score/route.ts` (NEW) — GET computes score; POST logs time
- `src/app/api/doz/hiring/route.ts` (NEW) — GET returns plan + team; PATCH updates stage status
- `src/components/doz/founder-freedom-card.tsx` (NEW) — prominent card with conic-gradient gauge + 5 mini metrics + time allocation bar + Log Time dialog
- `src/components/doz/hiring-dashboard.tsx` (NEW) — 6-stage visual pipeline + stats row + current team list + status selector
- `src/components/modules/command-center.tsx` (EDITED) — added import + FounderFreedomCard for FOUNDER role only (between AI Briefing and KPI row, as prominent banner)
- `src/components/modules/team.tsx` (EDITED) — added "Hiring Plan" tab containing HiringDashboard

## API contracts

### GET /api/doz/founder-score
- Auth-gated (401 unauth)
- Computes score 0-100 across 5 metrics:
  - projectsWithoutFounder (25pts max): pct * 0.25
  - delegatedDecisions (20pts): pct * 0.20
  - strategyVsOps (20pts): ratio * 0.20
  - sopTasksNoEscalation (15pts): pct * 0.15
  - revenueWithoutFounderSales (20pts): pct * 0.20
- Rating: <30 FLEDGLING, 30-60 PROGRESSING, >60 INDEPENDENT
- Returns: `{ score, rating, metrics, timeAllocation, timeTarget, trend, recommendations }`

### POST /api/doz/founder-score
- Body: `{ action: "log_time", category, hours, notes? }`
- FOUNDER + STAFF only (403 for intern/freelancer)
- Categories: SALES, OPERATIONS, ADMINISTRATION, STRATEGY, DELIVERY
- Creates a FounderTimeLog for the current user

### GET /api/doz/hiring
- Auth-gated
- Returns: `{ currentTeam, hiringPlan, stats, teamUtilization }`
- Each hiring stage has computed `isReady` + `readinessChecks: { revenueSupports, utilizationHigh }`
- `isReady` for OPEN = revenueSupports AND utilizationHigh; FORECASTED = revenueSupports only

### PATCH /api/doz/hiring
- Body: `{ stageId, status, hiredName?, notes? }`
- FOUNDER only (403 for staff/intern/freelancer)
- Valid statuses: FORECASTED, OPEN, INTERVIEWING, OFFERED, HIRED, ONBOARDED
- If status = HIRED/ONBOARDED and hiredAt is null → sets hiredAt = now
- Reverting to FORECASTED/OPEN/INTERVIEWING/OFFERED → clears hiredAt + hiredName

## Verified outputs (authenticated curl as founder)

### /api/doz/founder-score
- score=39, rating=PROGRESSING, trend=FLAT
- projects: 2/7 (28.6%)
- decisions: 0/2 (0%)
- strategy: 3h / ops: 7.5h → 28.6% ratio
- sop tasks: 6/15 (40%)
- revenue: 1/1 (100%) — single WON opportunity is REFERRAL source
- timeAlloc: sales=3.5, operations=7.5, administration=5, strategy=3, delivery=5
- recommendations: 2 fired (admin >4h + projectsWithoutFounder <30%)
- Math verified: 28.6*0.25 + 0*0.20 + 28.6*0.20 + 40*0.15 + 100*0.20 = 38.87 → 39 ✓

### /api/doz/hiring
- stats: totalTeam=13, open=1, forecasted=5, budget=₦1.75M/mo, avgHire=0d
- teamUtilization: 21%
- 6 stages all present, stage 1 (BD Exec) OPEN with isReady=false (utilization only 21%, not >80%)
- Stages 2-6 FORECASTED with isReady=true (revenue supports; utilization not required for FORECASTED)

### POST log_time
- 201 success → `{"ok":true,"id":"...","loggedAt":"..."}`
- 400 for invalid category / invalid hours / unknown action
- 401 unauth, 403 for intern/freelancer

### PATCH hiring
- 200 success → `{"ok":true,"stage":{...}}`
- HIRED transition correctly sets hiredAt = now + preserves hiredName/notes
- Reverting to OPEN correctly clears hiredAt + hiredName (keeps notes)
- 400 for invalid status / missing stageId
- 404 for nonexistent stageId
- 401 unauth, 403 for non-founder

## Lint
- `bun run lint` → EXIT 0, zero errors/warnings

## Dev server
- Next.js 16.1.3 Turbopack on port 3000
- GET / 200 (page renders cleanly with founder session)
- GET /api/doz/founder-score 200 (authed)
- GET /api/doz/hiring 200 (authed)

## Color discipline
- Emerald primary, amber warning, rose danger, teal info, muted zinc
- NO indigo/blue (OFFERED status uses cyan, which is teal-adjacent, to differentiate from blue)
- Conic-gradient gauge uses rating color (rose <30, amber 30-60, emerald >60)

## Stage Summary
- Founder Freedom Score is now one of the FIRST things the founder sees on the Command Center — placed as a full-width banner between the AI Morning Briefing and the KPI row.
- The 5 mini metrics make independence measurable: % projects without you, % decisions delegated, strategy time %, % SOP tasks not escalating to you, % revenue from non-direct channels.
- The time allocation stacked bar (sales/ops/admin/strategy/delivery) with target comparison makes it obvious when the founder is spending too much time on admin/ops vs strategy.
- The Log Time dialog lets the founder log time inline without leaving the Command Center.
- The Hiring Dashboard in Team Management visualises the 6-stage plan from BD Executive (OPEN now) through Technology/Product Manager (FORECASTED). Each stage shows reason, success metric, status badge, salary budget, target date, and — for OPEN stages — the "Is it time?" readiness check (revenue + utilization). Founder can update stage status inline.
- The recommendation engine fires context-aware messages: admin >4h, strategy ratio <15%, projects without founder <30%, score <30 (FLEDGLING warning), score ≥60 (INDEPENDENT praise).
