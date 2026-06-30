# Task GF5 — KPI Target System

**Agent:** KPI Target System Builder
**Task:** Create a reusable KPI target system that shows every metric with: Current Value, Target, Forecast, Confidence Score, Required Weekly Pace. Integrate it into the Command Center and Financial Intelligence module.

## Files Created
1. `src/app/api/doz/kpis/route.ts` (~290 lines) — GET (list KPIs with computed progress/status/trend/display) + PATCH (update a KPI's current value, FOUNDER/STAFF only)
2. `src/components/doz/kpi-target-card.tsx` (~280 lines) — KpiTargetCard component (status badge, large current value, target + progress %, colored progress bar, weekly pace, AI forecast, confidence bar, Year 1/Year 3 targets) + KpiTargetCardSkeleton
3. `src/components/doz/kpi-target-row.tsx` (~140 lines) — KpiTargetRow compact horizontal row (h-12, single line, inline progress bar) + KpiTargetRowSkeleton
4. `src/components/doz/growth-targets-grid.tsx` (~190 lines) — Reusable section: fetches /api/doz/kpis and renders a grid of KpiTargetCards. Two modes: `mode="key"` (keyMetrics) or `mode="names"` (specific KPIs by name). Header includes summary badges (Ahead / On Track / Behind / At Risk counts) + Refresh button.

## Files Edited
5. `src/components/modules/command-center.tsx` (+8 lines): Added import + role-gated `<GrowthTargetsGrid mode="key" />` between the KPI row and the main grid. Header: "Growth Targets — Are we ahead or behind?" Visible to FOUNDER + STAFF only.
6. `src/components/modules/financial.tsx` (+15 lines): Added import + `<GrowthTargetsGrid mode="names" />` at the top of the Overview tab, BEFORE the cash flow chart. Names: Annual Revenue, Net Profit Margin, Gross Margin Per Project, Cash Position, Outstanding Receivables (days). Header: "Financial Targets — Are we on track?"
7. `src/app/api/doz/ai/briefing/route.ts` (1-line fix): Fixed pre-existing parser error — `(b.amount || b.opportunity?.value ?? 0)` → `(b.amount || (b.opportunity?.value ?? 0))` (Nullish coalescing requires parens when mixing with `||`). This was blocking dev server compilation.
8. `.env` (+2 lines): Re-added `NEXTAUTH_SECRET=doz-os-dev-secret-2025-stable-key-for-jwt-signing` and `NEXTAUTH_URL=http://localhost:3000` (was missing, causing `JWEDecryptionFailed` on every authenticated API request after a server restart).

## API Design

### GET /api/doz/kpis (auth-gated)
Returns:
```ts
{
  kpis: ComputedKPI[],         // all 33 growth KPIs
  byCategory: Record<string, ComputedKPI[]>,  // grouped by REVENUE/SALES/MARKETING/FINANCE/OPERATIONS/PEOPLE/FOUNDER/EVENTCO
  keyMetrics: ComputedKPI[],   // filtered to isKeyMetric=true (15 KPIs)
  summary: { ahead, onTrack, behind, atRisk, total }
}
```

Each ComputedKPI has all DB fields plus:
- `progressPct` — 0-100 (rounded to 1 decimal)
- `status` — AHEAD / ON_TRACK / BEHIND / AT_RISK
- `displayCurrent` / `displayTarget` — formatted ("₦38.0M", "70%", "8", "45 days")
- `displayWeeklyPace` — formatted ("₦2.30M/wk needed", "5/wk", "3%/wk", "2 days/wk") or null
- `trend` — UP / DOWN / FLAT (derived from forecast + status)
- `lowerIsBetter` — boolean

### Status Algorithm
**Higher-is-better (default):**
- progress > 110% → AHEAD
- 90–110% → ON_TRACK
- 50–89% → BEHIND
- < 50% → AT_RISK

**Lower-is-better (referral dependency, outstanding receivables, budget variance, founder operational time, outstanding invoices):**
- current ≤ target → AHEAD (100%)
- current > target but ratio ≤ 1.2 → BEHIND
- else → AT_RISK
- progressPct = (target / current) × 100 when current > target

### PATCH /api/doz/kpis (FOUNDER + STAFF only)
Body: `{ kpiId: string, current: number }`
- Validates kpiId is a non-empty string, current is a finite non-negative number
- Updates both `current` and `forecast` (auto-recalculated from new current/target)
- Returns `{ kpi: ComputedKPI }` with all computed fields

## Component Design

### KpiTargetCard
```
┌─────────────────────────────────┐
│ Annual Revenue          AHEAD   │  ← status badge (emerald/teal/amber/rose)
│                                 │
│ ₦38.0M                  31.7% ↑ │  ← large value + progress % + trend
│ Target: ₦120M                   │
│ ████████░░░░░░░░░░░░░░░░░░░     │  ← progress bar (colored by status)
│                                 │
│ ⚡ Weekly pace: ₦2.30M/wk needed │
│ 🎯 AI Forecast: On Track        │
│                                 │
│ Confidence          82%         │  ← confidence bar (green >70, amber 40-70, rose <40)
│ ████████░░░░                    │
│                                 │
│ ──────────────────────────────  │
│ Year 1: ₦120M  Year 3: ₦500M   │  ← hidden when compact=true
└─────────────────────────────────┘
```
- Left border colored by status (4px)
- `compact` prop hides year targets + confidence for tighter layouts
- Loading: KpiTargetCardSkeleton mirrors the layout

### KpiTargetRow
```
● Annual Revenue  ₦38.0M / ₦120M  ████████░░░░ 31.7%  ↑  AHEAD
```
- Single h-12 line, truncate name on overflow
- Status dot (left), name (32-char), current/target, inline progress bar, %, trend icon, status label
- Mobile: hides the "/target" portion
- Loading: KpiTargetRowSkeleton

### GrowthTargetsGrid
- Fetches `/api/doz/kpis` with `cache: "no-store"` on mount
- Header: title + description + summary badges (Ahead N · On Track N · Behind N · At Risk N) + Refresh button (sonner toast)
- Body: responsive grid (1→2→3 or 1→2→4 columns)
- Two modes: `mode="key"` shows keyMetrics, `mode="names"` shows specific KPIs by name (preserves the order of the `names` array — important for Financial module to show Annual Revenue first)
- Empty state: dashed-border card with "No growth targets found"
- Loading: KpiTargetCardSkeleton grid

## Integration

### Command Center
- Placed between KPI row (6 StatCards) and main grid (Top Priorities / Pending Approvals etc.)
- Gated to FOUNDER + STAFF only (mirrors the AiBriefingCard pattern from G4)
- Shows 15 key metrics in a 3-column grid
- Header: "Growth Targets — Are we ahead or behind?"

### Financial Intelligence → Overview tab
- Placed ABOVE the cash flow chart and outstanding invoices card
- Shows 5 financial KPIs by name (Annual Revenue, Net Profit Margin, Gross Margin Per Project, Cash Position, Outstanding Receivables)
- Header: "Financial Targets — Are we on track?"
- Visible to anyone who can reach the Financial module

## Color Discipline (NO indigo/blue)
- AHEAD = emerald (badge, bar, border, dot, text-emerald-300/400)
- ON_TRACK = teal
- BEHIND = amber
- AT_RISK = rose
- Confidence: >70 green (emerald), 40-70 amber, <40 rose
- Year 1 / Year 3: muted text + primary accent
- Refresh button: muted-foreground, hover bg-accent

## Testing
- Dev server (Next.js 16 Turbopack on port 3000) — Ready in ~800ms, compiles cleanly.
- Authenticated curl flow (csrf → callback/credentials with `founder@digitonezero.com` / `doz2025` — extracted Set-Cookie session-token manually because auth.ts forces `secure: true` on cookies):
  - `GET /api/doz/kpis` (no auth) → 401 `{"error":"unauthorized"}` ✓
  - `GET /api/doz/kpis` (authed) → 200, 34544 bytes. Returns `{kpis[33], byCategory{8 cats}, keyMetrics[15], summary{ahead:0, onTrack:0, behind:11, atRisk:22, total:33}}` ✓
  - All 5 financial KPIs present and correctly computed:
    - Annual Revenue: ₦38.00M / ₦120.00M → AT_RISK (31.7%) pace=₦2.30M/wk needed ✓
    - Net Profit Margin: 22% / 25% → BEHIND (88%) ✓
    - Gross Margin Per Project: 25% / 30% → BEHIND (83.3%) ✓
    - Cash Position: ₦12.00M / ₦30.00M → AT_RISK (40%) ✓
    - Outstanding Receivables: 45 days / 30 days → AT_RISK (66.7%) [lowerIsBetter=true] ✓
  - Lower-is-better math verified: Referral Dependency 70% vs 40% target → progressPct=57.1% (=40/70*100), status=AT_RISK (ratio 1.75 > 1.2) ✓
  - `PATCH /api/doz/kpis {kpiId, current:50000000}` (authed) → 200, returns updated KPI with new current=₦50M, progressPct=41.7%, forecast auto-recalculated to "AT_RISK" ✓
  - `PATCH /api/doz/kpis {kpiId, current:38000000}` (restore) → 200 ✓
  - `PATCH /api/doz/kpis` (no auth) → 401 `{"error":"unauthorized"}` ✓
- `GET /` → 200, 30451 bytes, page compiles cleanly.
- `bun run lint` → EXIT 0, zero errors/warnings.

## Stage Summary
- KPI Target System is fully implemented and verified end-to-end.
- API: GET /api/doz/kpis returns all 33 growth KPIs with computed progress/status/trend/display + grouped byCategory + keyMetrics filter + summary. PATCH /api/doz/kpis allows FOUNDER/STAFF to update a KPI's current value (auto-recalculates forecast).
- Components: KpiTargetCard (detailed card with status badge, large current value, target+progress %, colored progress bar, weekly pace, AI forecast, confidence bar, Year 1/3 targets), KpiTargetRow (compact h-12 single-line row for embedding), GrowthTargetsGrid (reusable section that fetches + renders a grid of cards).
- Integration: Command Center has a "Growth Targets — Are we ahead or behind?" section (FOUNDER/STAFF only, between KPI row and main grid) showing 15 key metrics. Financial module's Overview tab now leads with 5 financial target cards (Annual Revenue, Net Profit Margin, Gross Margin Per Project, Cash Position, Outstanding Receivables) above the cash flow chart.
- Color discipline: emerald (AHEAD), teal (ON_TRACK), amber (BEHIND), rose (AT_RISK). NO indigo, NO blue.
- Lower-is-better detection: explicit name list (referral dependency, outstanding receivables, budget variance, founder operational time, outstanding invoices) + auto-detection for target=0 with keyword match.
- Side fixes: re-added NEXTAUTH_SECRET to .env (was missing, causing JWEDecryptionFailed on every authed API request); fixed pre-existing parser error in ai/briefing/route.ts (nullish coalescing precedence).
