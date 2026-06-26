# Task 5 — Strategic Planning (Annual→Quarterly→Monthly→Weekly + Distraction Detection)

## What was built
- **API**: `src/app/api/doz/planning/route.ts` — single batched `Promise.all` of `db.goal.findMany` (with owner + 1-level children) + `db.task.findMany` (with assignee + goal + project). Computes the goal tree (top-level = `parentId == null`, children nested via the include), `goalsByType` flat lists, and 9 stats.
- **UI**: `src/components/modules/strategic-planning.tsx` — overwrote the 1-line stub. Full "use client" component.

## API contract (`GET /api/doz/planning`)
```
{
  stats: { activeGoals, achievedGoals, missedGoals, overdueTasks, dueToday, distractions, completedThisWeek, completionRate, avgGoalProgress },
  goals: [{ id, title, description, type, status, progress, quarter, startDate, dueDate, ownerId, owner:{name}, parentId, children:[{id,title,type,progress,status,dueDate}] }],
  tasks: [{ id, title, description, status, priority, category, isDistraction, dueDate, estimatedHrs, actualHrs, completedAt, assignee:{name,role}, goal:{title,type}, project:{name} }],
  goalsByType: { ANNUAL:[...], QUARTERLY:[...], MONTHLY:[...], WEEKLY:[...] }
}
```

## UI layout (delivered)
1. **Top KPI row (6 StatCards)** — Active Goals (primary accent), Avg Goal Progress %, Due Today, Overdue Tasks (danger accent), Distractions (warning accent), Completion Rate %.
2. **Left column (lg:col-span-2)**:
   - **Goal Cascade** — flattened Annual→Quarterly→Monthly→Weekly from `goalsByType`. Each row shows level icon, status badge, title, owner first name, MiniBar progress, relative due date (rose if overdue, primary if achieved). Indentation increases per level (level 0 full width ring-primary, level 1 ml-0 + border-l-2 pl-4, level 2 ml-4, level 3 ml-8) — visually shows the parent→child cascade.
   - **Task list with Tabs** — Today (grouped by priority URGENT/HIGH/MEDIUM/LOW), This Week, All, Distractions. Each row: circle toggle (visual + toast), PriorityDot, title (strikethrough if done), CategoryBadge (STRATEGIC=emerald, OPERATIONAL=teal, ADMIN=muted, DISTRACTION=amber), goal link, project name, assignee Avatar with avatarColor/initials, due date (rose + OVERDUE badge if overdue, amber bg + DISTRACTION badge if distraction), status badge. Lists use `max-h-96 overflow-y-auto scroll-thin`.
3. **Right column**:
   - **Distraction Detector** — amber-bordered card (border-amber-500/40 bg-amber-500/5), AlertTriangle icon, count badge, list of distraction tasks (first 4 + "+N more"), and a recommendation box: "Batch these into a single 30-min block at 4 PM. Don't let them fracture deep work."
   - **Weekly Focus** — first WEEKLY goal + Progress bar + days-remaining countdown (rose if overdue, amber if ≤1 day) + checklist of weekly tasks (tappable to toggle done).
   - **Goal Health** — SVG donut chart (achieved=primary, active=teal, missed=destructive) + 3-stat footer grid.

## Conventions honored
- `import { db } from "@/lib/db"` in API.
- Shared primitives: `StatCard`, `StatusBadge`, `SectionHeader`, `EmptyState`, `MiniBar`, `PriorityDot` from `@/components/doz/ui-primitives`.
- Format helpers: `formatDate`, `relativeTime`, `daysUntil`, `avatarColor`, `initials` from `@/lib/format`.
- shadcn/ui: `Card`, `Tabs/TabsContent/TabsList/TabsTrigger`, `Skeleton`, `Badge`, `Avatar/AvatarFallback`, `Progress`.
- `toast` from `sonner` for the visual toggle feedback.
- lucide-react icons: `Target`, `Flag`, `AlertTriangle`, `CheckCircle2`, `Clock`, `TrendingUp`, `Calendar`, `ChevronRight`, `Circle`, `CircleDot`.
- Color discipline: emerald primary, amber for distractions, rose for overdue — NO indigo/blue.
- Loading: full skeleton grid mirroring layout. Error: EmptyState with AlertTriangle.
- All scrollable task lists use `max-h-96 overflow-y-auto scroll-thin`.

## Testing
- Dev server restarted cleanly (port 3000, Ready in 599ms).
- `curl -s http://localhost:3000/api/doz/planning -m 30` → HTTP 200, ~7.6KB JSON.
- Verified stats: `{ activeGoals: 4, achievedGoals: 0, missedGoals: 0, overdueTasks: 0, dueToday: 4, distractions: 1, completedThisWeek: 0, completionRate: 0, avgGoalProgress: 49 }`.
- Verified shape: 1 top-level goal (ANNUAL with 1 nested child via include), 4 goals in `goalsByType` (1 each per type), 15 tasks (1 distraction flagged).
- `GET /` → HTTP 200, compiles cleanly in ~2.3s.
- `bun run lint` → EXIT=0, zero errors and zero warnings across the entire repo.

## Stage summary
- Files: `src/app/api/doz/planning/route.ts` (new), `src/components/modules/strategic-planning.tsx` (overwrote stub with ~1100-line implementation).
- The Strategic Planning module makes the "every task must connect to a larger goal" principle visual via the cascade, and actively identifies distractions via the dedicated detector card + Distractions tab + amber styling on distraction rows.
- Task toggle is visual-only with `sonner` toast feedback per spec ("keep simple, visual toggle with toast"); no POST API was required.
- Ready for visual review via Preview Panel / "Open in New Tab".
