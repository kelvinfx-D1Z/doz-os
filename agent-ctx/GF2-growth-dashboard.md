# Task GF2 — Growth Dashboard Builder

## Task
Build the Growth Dashboard — the most important dashboard in DOZ OS — measuring progress toward the ₦500M vision across 9 sections. Answers "are we ahead or behind?" for every metric.

## Files Touched
- **NEW** `src/app/api/doz/growth/route.ts` (~470 lines) — GET endpoint computing all 9 sections
- **NEW** `src/components/modules/growth-dashboard.tsx` (~620 lines) — full cockpit UI
- **EDITED** `src/lib/store.ts` — added "growth" to ModuleId
- **EDITED** `src/components/doz/app-shell.tsx` — added Growth Dashboard to nav (FIRST in Operate group), MODULES, MODULE_META, ROLE_MODULES (FOUNDER + STAFF), TrendingUp import

## Key Design Decisions

1. **Health score mapping** — KPIs span 8 categories (REVENUE, SALES, MARKETING, FINANCE, OPERATIONS, PEOPLE, FOUNDER, EVENTCO). Mapped to 6 health-score categories: sales←SALES+REVENUE, marketing←MARKETING, finance←FINANCE, operations←OPERATIONS, people←PEOPLE+FOUNDER, delivery←EVENTCO. Each health score = avg of progressPct of KPIs in that category, clamped 0-100. Overall = avg of 6 categories.

2. **Lower-is-better metrics** — Several KPIs (Outstanding, Referral Dependency, Budget Variance, Founder Operational Time, anything with target=0) need inverted progress: progress = (target/current)×100. Detected via `isLowerIsBetter(name, target)` helper using name keywords + target=0 check.

3. **Status computation** — AHEAD if forecast=AHEAD OR pct≥100; ON_TRACK if ≥75; BEHIND if ≥40; AT_RISK otherwise. Forecast from KPI table overrides progress-based status.

4. **6 Key Metrics hand-picked** — The seed has 15 isKeyMetric=true KPIs. For the cockpit row, I hand-picked 6 that span all strategic areas: Annual Revenue, Monthly Qualified Leads, Proposal Win Rate, Referral Dependency, Founder Freedom Score, EventCo Platform Progress.

5. **Operations metrics from KPI** — Initially tried computing Projects On Time + Budget Variance from live project data, but the seeded KPI values (75%, 12%) are more meaningful. Switched to use KPI current value for these two, keeping live computation for Avg Profit Margin + Vendor Performance + At-Risk count.

6. **Live data merged with KPI targets** — Revenue (YTD) computed from `invoice.amountPaid` this year; Pipeline from open opportunities; Win Rate from won/(won+lost); Referral % from opportunities with source=REFERRAL; Founder hours from FounderTimeLog this week; etc.

7. **Health ring via conic-gradient** — Pure CSS, no recharts needed. Outer conic gradient colored by score (emerald/amber/rose), inner disc shows score + label. 180×180px, ARIA-labeled.

8. **Status color discipline** — AHEAD=emerald (#10b981), ON_TRACK=teal (#14b8a6), BEHIND=amber (#f59e0b), AT_RISK=rose (#f43f5e). NO indigo/blue. Consistent across all components.

## Testing Results

### curl (authenticated as founder@digitonezero.com)
- `GET /api/doz/growth` (no auth) → 401 `{"error":"unauthorized"}` ✓
- `GET /api/doz/growth` (authed) → 200, 20.2KB JSON ✓
- Health Score: `{sales:53, marketing:28, finance:20, operations:62, people:48, delivery:3, overall:36}`
- 33 KPIs total, 15 isKeyMetric=true
- 8 sections, 45 metrics total
- Summary: `{ahead:7, onTrack:8, behind:10, atRisk:20}`
- Live data verified: Revenue (YTD)=₦31.5M, Pipeline=₦113.8M, Win Rate=100%, Founder hours this week (Sales=3.5h, Ops=7.5h, Admin=5h, Strategy=3h)
- Lower-is-better logic verified: Referral %=50% (target 40%) → 80% progress → ON_TRACK; Outstanding=₦9.9M (target ₦0) → 0% progress → AT_RISK

### Home page
- `GET /` (authed) → 200, 30.4KB HTML, compiles cleanly
- dev.log shows `GET /api/doz/growth 200 in 126ms`

### Lint
- `bun run lint` → EXIT 0, zero errors/warnings

## Notes for Future Agents
- The Growth Dashboard is the cockpit — it leads the Operate nav group (above Command Center).
- Available to FOUNDER + STAFF only (interns/freelancers don't see company growth metrics).
- API contract: `{ healthScore, kpis, sections, summary }`. The `sections` object has 8 keys (revenue, bizdev, marketing, clientSuccess, operations, founder, people, eventco), each with multiple metrics.
- Each metric has: `name, current, target, progressPct, status, unit, displayCurrent, displayTarget, weeklyPace?, confidence?, lowerIsBetter?`.
- The 6 Key Metrics cards are hand-picked — to change them, edit the `keyMetricNames` array in growth-dashboard.tsx.
- Status thresholds: ≥100 AHEAD, ≥75 ON_TRACK, ≥40 BEHIND, else AT_RISK. Forecast from KPI table overrides.
