# Task 7 — Projects & Events Module (agent: code)

## Summary
Built the Projects & Event Operations module for DOZ OS — both the aggregate API route and the React UI component. Replaced the stub at `src/components/modules/projects-events.tsx` with a full implementation. Added the API at `src/app/api/doz/projects/route.ts`.

## Files created/modified
- `src/app/api/doz/projects/route.ts` (NEW) — GET endpoint
- `src/components/modules/projects-events.tsx` (OVERWRITTEN stub) — full "use client" component

## API design
- Single Promise.all batch: fetch all projects with includes (account, manager, crew.user, milestones, deliverables, _count) PLUS a separate lean query for expenses (projectId + amount only).
- Expenses grouped into a Map in JS so per-project `expensesTotal` is O(expenses) once, not per-project.
- Computed per project: `expensesTotal`, `profit = revenue - expensesTotal`, `margin = profit/revenue*100` (0 when revenue is 0).
- Stats rollup: total, active (PLANNING/CONFIRMED/IN_PROGRESS), completed, totalRevenue, totalExpenses, totalProfit, avgMargin (averaged only over revenue-generating projects).
- Output shape exactly matches the spec.

## Verified response
```
{
  stats: { total:7, active:5, completed:2, totalRevenue:93300000, totalExpenses:20760000, totalProfit:72540000, avgMargin:77.42 },
  projects: [7 items with id,name,code,serviceType,status,eventDate,venue,budget,revenue,progress,startDate,endDate,account,manager,crew,milestones,deliverables,_count,expensesTotal,profit,margin]
}
```
HTTP 200, ~7KB JSON, ~154ms.

## UI design
- SectionHeader with module title.
- 6 StatCards in a responsive grid (2 / 3 / 6 cols): Total Projects, Active, Revenue (compact NGN), Profit (compact NGN), Avg Margin %, Completed.
- Tabs (All | Active | Planning | In Progress | Completed) with per-tab counts in the trigger.
- Project cards in `grid lg:grid-cols-2 gap-4`, each card has:
  - Code (mono, muted) + name + StatusBadge
  - Service-type Badge (with icon) + account name (amber star if isStrategic)
  - Event date + venue (Calendar + MapPin)
  - Financial block: Revenue vs Budget with MiniBar (emerald normally, amber if expenses > 80% revenue), High-burn warning
  - Profit + margin pill (green positive, red negative)
  - Progress bar (project.progress)
  - Crew count + avatar stack (`-space-x-2`, first 3 members, +N overflow chip)
  - Next 2 upcoming milestones with relativeTime
  - Deliverables summary ("2 pending, 1 in review, 1 delivered")
  - Footer counts (tasks/invoices/expenses) and a "View details →" hint
- Clicking a card opens a Dialog (max-w-2xl) with:
  - Full header (code, status, name, service, account, PM)
  - 4 quick-fact tiles (Revenue, Budget, Expenses, Profit/Margin)
  - Event + start/end dates
  - Progress bar
  - Crew list (scrollable max-h-48) with avatar, role, day rate, status
  - Milestones list (scrollable) with due date, relative time, status
  - Deliverables list (scrollable) with type, due date, approval status
- Loading: ProjectsSkeleton (KPI skeleton row + TabsList skeleton + 4 card skeletons)
- Error: EmptyState with AlertTriangle
- All scrollable regions use `scroll-thin` class.

## Styling rules honored
- Cards p-4 / lg:p-5
- StatCard, StatusBadge, SectionHeader, EmptyState, MiniBar all from `@/components/doz/ui-primitives`
- formatNGN, formatDate, relativeTime, avatarColor, initials from `@/lib/format`
- Lucide icons used: Calendar, MapPin, Users, Film, CheckCircle2, Clock, AlertTriangle, Star, Clapperboard, TrendingUp, Wallet, CircleDollarSign, Trophy, FolderKanban
- Colors: emerald (primary/profit), amber (warning/high-burn/strategic star), rose (danger/loss). NO indigo/blue anywhere.
- Avatar stack overlaps with `-space-x-2`
- Loading uses Skeleton from `@/components/ui/skeleton`
- Scrollable lists use `scroll-thin`, `max-h-96 overflow-y-auto` (used max-h-48 for tighter dialog sections)

## Lint & runtime
- `bun run lint` exits 0 (after fixing one initial error: removed redundant `setLoading(true)` inside useEffect — initial state already `true`).
- Dev server running on port 3000, page returns HTTP 200, API returns HTTP 200.

## Notes for downstream agents
- This module's API path is `/api/doz/projects` — keep this name when cross-linking from dashboard / financial modules.
- The computed `expensesTotal/profit/margin` fields on each project match what the Financial Intelligence module likely needs; consider reusing this endpoint rather than re-aggregating.
- The Dialog is rendered inline (not in a portal-aware wrapper) — Radix handles portal mounting automatically.
